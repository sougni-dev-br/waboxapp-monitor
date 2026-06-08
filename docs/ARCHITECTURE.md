# 🏗️ Sougni Monitor — Arquitetura Completa

> Documento de referência para qualquer dev pegar o projeto e entender de onde
> vem cada coisa. Mantenha este arquivo sincronizado com o código quando
> mudar contratos públicos (endpoints, env vars, schema).

---

## 1. Visão geral em 30 segundos

Painel **single-tenant** white-label para monitorar canais WhatsApp via WaboxApp +
dashboard executivo de mídia paga (Google Ads) e funil de vendas (Pipeline) de
clínicas oftalmológicas. Tudo roda na conta `OWNER_ID = 1` (Sougni).
Multi-usuário só por **role** (admin/user).

```
Browser (React 19 + Vite + tRPC client)
        ↓ HTTPS /api/trpc + /api/sse
Express 4 server (Node 20)
  ├─ tRPC v11 (routers.ts) ─────── lógica de negócio
  ├─ Webhook HTTP (POST /api/webhook/waboxapp)
  ├─ SSE (/api/sse) ─────────────── push em tempo real
  ├─ Poller (60s) ──────────────── status das instâncias
  └─ KeepAlive (5min self-ping)
        ↓
Postgres (Render Managed) — drizzle-orm
        ↑
WaboxApp REST API (waboxapp.com)
Google Sheets (publicado como CSV — sem auth)
```

**Stack:** TypeScript fullstack · React 19 · Vite 7 · Express 4 · tRPC 11 ·
Drizzle ORM 0.44 · Postgres 8 · bcryptjs · jose (JWT) · superjson ·
TailwindCSS 4 · shadcn/ui · Wouter (router) · Sonner (toast) · Recharts ·
Lucide-react.

---

## 2. Deploy & infra

| Componente | Onde roda | Como sobe |
|---|---|---|
| App (server + client buildado) | **Render** (Web Service) | `npm start` → `dist/index.js` (esbuild bundle) |
| Postgres | **Render Managed Postgres** | conectado via `DATABASE_URL` |
| Repo Git | github.com/**sougni-dev-br**/waboxapp-monitor | auto-deploy no push pra `main` |
| Domínio | `monitor.sougni.com` | DNS aponta para Render |
| Webhook URL exposta | `https://monitor.sougni.com/api/webhook/waboxapp` | configurado por instância no painel WaboxApp |

**Scripts npm** (`package.json`):

| Script | Comando | Quando |
|---|---|---|
| `dev` | `tsx watch server/_core/index.ts` (NODE_ENV=development, Vite middleware) | local |
| `build` | `vite build && esbuild server/_core/index.ts ... --outdir=dist` | CI Render |
| `start` | `node dist/index.js` | runtime Render |
| `check` | `tsc --noEmit` | precommit |
| `test` | `vitest run` | CI |
| `db:generate / db:migrate / db:push` | drizzle-kit | dev local quando muda schema |

---

## 3. Variáveis de ambiente

Lidas em `server/_core/env.ts` e diretamente via `process.env`.

| Var | Onde é lida | Default | Obrigatória? |
|---|---|---|---|
| `DATABASE_URL` | `server/db.ts > getDb()` | — | ✅ sim |
| `JWT_SECRET` | `_core/env.ts` (assinatura cookie `panel_session`) | `"waboxapp-panel-secret"` (NÃO usar em prod) | ✅ em prod |
| `PANEL_PASSWORD` | `_core/env.ts` (legacy — login agora é bcrypt no DB) | — | ❌ |
| `PUBLIC_URL` | `_core/env.ts` | — | só pra logging |
| `BASE_PATH` | `_core/env.ts` | `/monitor` | hoje no Render serve em `/` |
| `COOKIE_PATH` | `routers.ts` (auth.login/refresh/logout) | `/` | ❌ |
| `PORT` | `_core/index.ts` | `3000` (busca próximo livre se ocupado) | ❌ |
| `NODE_ENV` | vários | — | `production` em deploy |
| `KEEP_ALIVE_ENABLED` | `_core/index.ts` | `true` (só desabilita se = `"false"`) | ❌ |
| `PGSSLMODE` | `db.ts` (pool pg) | — | ❌ |
| `SHEETS_CUSTOS_CSV_URL` | `sheetsIngest.ts` (aba CUSTOS) | hardcoded fallback no código | ❌ |
| `SHEETS_PIPELINE_CSV_URL` | `sheetsIngest.ts` (aba PIPELINE) | hardcoded fallback no código | ❌ |

> ⚠️ Não há `.env` commitado — variáveis ficam no painel do Render.
> Em dev local, criar `.env` no root com pelo menos `DATABASE_URL` (e
> `JWT_SECRET` se quiser logins consistentes entre restarts).

---

## 4. Banco de dados — schema completo

Schema único em **`drizzle/schema.ts`**. Migrations idempotentes aplicadas no
boot por `server/_core/migrate.ts > ensureAuthSchema()` — não precisa rodar
`drizzle-kit migrate` em prod.

### Enums

```
role             = user | admin
instance_status  = online | offline | unknown
contact_type     = user | group
label_match_type = contains | starts_with | exact
message_direction= in | out
message_type     = chat | image | video | audio | ptt | document | vcard | location | unknown
```

### Tabelas

| Tabela | Colunas-chave | Propósito |
|---|---|---|
| **users** | id, openId✦unique, username✦unique, passwordHash (bcrypt), name, email, loginMethod, role, active, createdAt, updatedAt, lastSignedIn | conta de login do painel |
| **api_configs** | id, userId, token (waboxapp), updatedAt | token global WaboxApp do dono do painel |
| **instances** | id, userId, uid, alias, status, platform, battery, plugged, locale, hookUrl, lastCheckedAt, lastOnlineAt | canal WhatsApp registrado |
| **contacts** | id, instanceId, uid, name, type, labelId *(legacy single)*, lastMessageAt, messageCount, createdAt, updatedAt | lead/contato de uma instância |
| **messages** | id, instanceId, contactId, muid, cuid, direction, type, body(jsonb), ack, dtm(bigint), createdAt | histórico de conversa |
| **status_logs** | id, instanceId, status, battery, plugged, checkedAt | histórico de online/offline (gerado pelo poller) |
| **labels** | id, userId, name, color (#hex), createdAt | marcadores |
| **label_rules** | id, userId, labelId, keyword, matchType, createdAt | regra automática "keyword → label" |
| **contact_labels** | (contactId, labelId) PK composta, createdAt | **N:N** múltiplos labels por contato |
| **automation_rules** | id, userId, name, trigger, hospital, keywords (text), delayMinutes, message, active | regras de automação configuráveis (worker ainda não dispara) |

**Sem FK declaradas** — toda integridade referencial é feita em código (ex.:
`deleteLabel` apaga labelRules + contact_labels + zera contacts.labelId antes
de apagar o label).

### Setup inicial

`deploy/setup.sql` — script SQL idempotente com todos `CREATE TABLE IF NOT EXISTS`.
Usado **uma vez** ao criar o banco. Depois disso, evoluções vão por
`ensureAuthSchema()` (que adiciona colunas idempotentemente) ou por drizzle-kit
gen+migrate em dev.

### Seed automático

`server/_core/migrate.ts` cria os usuários iniciais se a tabela `users` estiver
vazia (ou se faltar passwordHash):

| username | role | password padrão |
|---|---|---|
| `rafael` | admin | `Senha@123` |
| `caio` | admin | `Senha@123` |

(troque a senha logo no primeiro login)

---

## 5. Autenticação & Permissões

### Login flow

1. Frontend chama `auth.login({ username, password })`.
2. Backend (`routers.ts > auth.login`) busca user por username, valida bcrypt,
   gera JWT (HS256, expira em 365 dias) com payload
   `{ sub: userId, role, username }`.
3. Cookie `panel_session` é setado:
   - `httpOnly: true`
   - `secure: true` em HTTPS
   - `sameSite: "none"` em https / `"lax"` em http
   - `maxAge: 365d`
4. Cada request lê o cookie em `_core/context.ts > createContext()`, verifica
   o JWT, busca o user no banco, monta `ctx.user`.

### Refresh

`SessionRefresher` (`client/src/App.tsx`) chama `auth.refresh` ao montar e
depois a cada 7 dias — renova o JWT em silêncio.

### Procedure types (`_core/trpc.ts`)

| Procedure | Middleware | Quando usar |
|---|---|---|
| `publicProcedure` | nenhum | login, logout, me |
| `protectedProcedure` | exige `ctx.isAuthed` (UNAUTHORIZED se não) | maioria das queries/mutations |
| `adminProcedure` | exige `ctx.user.role === "admin"` (FORBIDDEN se não) | CRUD usuários, automation rules |

### Permissions map (`server/auth.ts > PERMISSIONS`)

```ts
manageInstances: ["admin"]
manageLabels:    ["admin"]
manageConfig:    ["admin"]
viewCriativos:   ["admin"]
viewDashboard:   ["admin", "user"]
viewContacts:    ["admin", "user"]
viewOperacao:    ["admin", "user"]
```

Frontend lê via `usePermissions().can("manageLabels")` — o hook puxa do
`auth.me`, que devolve o objeto `permissions` pré-calculado pra role do user.
Server reforça com `adminProcedure` em endpoints sensíveis (não confia na UI).

---

## 6. Endpoints HTTP (Express, não-tRPC)

Definidos em `server/_core/index.ts`:

| Método | Path | Auth | Função |
|---|---|---|---|
| GET | `/api/health` | — | health check (keep-alive) |
| GET | `/api/sse` | userId via query | Server-Sent Events para push em tempo real |
| GET | `/api/export/leads-for-pipeline` | **anônimo** (read-only, dados não sensíveis) | usado pelo Apps Script da planilha pra puxar leads |
| POST | `/api/webhook/waboxapp` | token validado contra `api_configs` | recebe eventos `message` e `ack` do WaboxApp |
| POST | `/api/webhook/debug` | — | echo do payload, pra diagnóstico |
| /\* (resto) | — | Vite (dev) / serveStatic (prod) — serve o SPA React |

### Eventos SSE (push para o frontend)

Emitidos em `broadcastToUser(userId, event, payload)`:

| Evento | Quando |
|---|---|
| `instance_status_changed` | poller detecta transição online↔offline |
| `instance_status_update` | atualização de rotina (bateria, plugged) |
| `dashboard_refresh` | a cada ciclo do poller |
| `new_message` | webhook recebeu mensagem |
| `message_ack` | webhook recebeu ack |
| `message_delivered` | ack=2 |
| `message_read` | ack≥3 (gatilho para futuras automações) |

### Payload do webhook WaboxApp

WaboxApp envia `application/x-www-form-urlencoded` com bracket notation.
Campos esperados:

- `token`, `event` (`message` | `ack`), `uid` (uid da instância)
- Para `event=message`: `contact[uid]`, `contact[name]`, `contact[type]`,
  `message[dir]` (`i`/`o`), `message[type]`, `message[uid]`, `message[cuid]`,
  `message[body][text]` ou `message[body]`, `message[dtm]`, `message[ack]`
- Para `event=ack`: `muid`, `ack`

Validação:

- Token bate com algum `api_configs.token` → identifica `userId`
- `uid` bate com alguma `instances.uid` (com ou sem sufixo `@c.us`/`@g.us`)

---

## 7. Endpoints tRPC completos

Base: **`/api/trpc/<router>.<procedure>`** · serializador: superjson · client:
`@trpc/react-query` em `client/src/lib/trpc.ts`. Todas as procedures abaixo
estão em `server/routers.ts`.

### `system`
Built-in do template `_core/systemRouter`. Queries pequenas de health.

### `auth` — login/sessão

| Procedure | Tipo | Input | Output | Acesso |
|---|---|---|---|---|
| `me` | query | — | `{id, username, name, email, role, permissions{}}` ou null | public |
| `login` | mutation | `{username, password}` | seta cookie `panel_session`; `{success, user}` | public |
| `refresh` | mutation | — | renova cookie | protected |
| `logout` | mutation | — | limpa cookie | public |

### `admin.users` — CRUD usuários (admin-only)

| Procedure | Input | Notas |
|---|---|---|
| `list` | — | retorna todos os users (sem passwordHash) |
| `create` | `{username, name, password, role}` | hash bcrypt, valida username único |
| `delete` | `{id}` | soft delete (active=false), bloqueia auto-delete |

### `admin.automation` — regras de automação (admin-only)

| Procedure | Input | Notas |
|---|---|---|
| `list` | — | ordenado por updatedAt desc |
| `upsert` | `{id?, name, trigger, hospital?, keywords?, delayMinutes, message, active}` | triggers permitidos: `lead_in`, `lead_no_reply_5min`, `lead_no_reply_30min`, `lead_read_no_reply`, `lead_keyword_match` |
| `delete` | `{id}` | |

> ⚠️ Regras estão **persistidas mas ainda não há worker** que as dispara.
> UI permite configurar; o motor de execução é o próximo passo.

### `config` — token WaboxApp

| Procedure | Input | Notas |
|---|---|---|
| `get` | — | `{hasToken, token}` |
| `save` | `{token}` | upsert |

### `instances` — canais WhatsApp

| Procedure | Input | Notas |
|---|---|---|
| `list` | — | todas as instâncias do OWNER_ID |
| `add` | `{uid, alias?}` | valida no WaboxApp, cria, registra status |
| `remove` | `{id}` | hard delete da instance |
| `updateAlias` | `{id, alias}` | renomeia o canal (corrigido para persistir após ciclos do poller) |
| `checkStatus` | `{id}` | força check WaboxApp + grava status_log |
| `statusLogs` | `{instanceId, limit?}` | últimas N entradas |
| `setupWebhook` | `{id?}` | tenta configurar hook_url via WaboxApp API |
| `webhookStatus` | — | retorna URL esperada vs atual de cada instância |

### `analytics`

| Procedure | Input | Notas |
|---|---|---|
| `dailyContacts` | `{instanceId, days?}` | série diária para gráfico |

### `labels` — marcadores

| Procedure | Input | Notas |
|---|---|---|
| `list` | — | |
| `create` | `{name, color (#hex)}` | |
| `update` | `{id, name?, color?}` | PATCH parcial |
| `delete` | `{id}` | cascata: regras → contact_labels → contacts.labelId → label |

### `labelRules` — regras automáticas keyword→label

| Procedure | Input | Notas |
|---|---|---|
| `list` | — | ordenado por createdAt |
| `create` | `{labelId, keyword, matchType?}` | |
| `update` | `{id, labelId?, keyword?, matchType?}` | |
| `delete` | `{id}` | |
| `reapply` | `{daysBack?}` (default 90) | varre contatos sem label dos últimos N dias e aplica regras |

### `contacts`

| Procedure | Input | Notas |
|---|---|---|
| `list` | `{instanceId, dateFrom?, dateTo?, labelId?}` | já enriquece com `labels[]` (N:N) |
| `listAll` | `{dateFrom?, dateTo?, labelId?}` | todos contatos de todas as instâncias |
| `setLabels` | `{contactId, labelIds[]}` | **multi-select manual**: sobrescreve atomicamente |

### `messages`

| Procedure | Input | Notas |
|---|---|---|
| `list` | `{contactId, limit?, offset?}` | paginação reversa |
| `send` | `{instanceId, contactId, contactUid, text}` | envia via WaboxApp, grava local com cuid `panel-<nanoid>` |

### `dashboard`

| Procedure | Input | Fonte de dados |
|---|---|---|
| `realtime` | — | RealtimePulse: último msg/contato, instâncias online/offline, bateria baixa, recent feed |
| `overview` | `{dateFrom?, dateTo?, hospitals?[], procedures?[]}` | KPIs (Total Leads, Contatados%, Agendadas, Realizadas, Cirurgia), funil, top instâncias, série temporal — combina monitor + planilha PIPELINE |
| `operation` | `{dateFrom?, dateTo?}` | KPIs operacionais (TMA, TME, SLA ≤5min) calculados em horário comercial Seg–Sex 08–17h BRT (`businessHours.ts`) |
| `mediaInvestment` | `{dateFrom?, dateTo?, hospitals?[], procedures?[]}` | agregação das 9 abas Google Sheets da planilha de mídia paga |
| `investment` | `{dateFrom?, dateTo?, hospital?}` | aba CUSTOS (legacy) |
| `pipeline` | `{dateFrom?, dateTo?, hospital?}` | aba PIPELINE (funil completo) |
| `exportLeadsForPipeline` | — | retorna todos leads do monitor processados para colar na planilha PIPELINE |

---

## 8. Serviços / APIs externas

| Serviço | URL base | Onde é chamado | Auth |
|---|---|---|---|
| **WaboxApp API** | `https://www.waboxapp.com/api` | `server/waboxapp.ts` (`checkInstanceStatus`, `sendTextMessage`, `setHookUrl`) | token query/body |
| **Postgres** | (Render internal) | `server/db.ts` | `DATABASE_URL` |
| **Google Sheets** — CUSTOS | `docs.google.com/spreadsheets/.../pub?output=csv` | `server/sheetsIngest.ts` | público |
| **Google Sheets** — PIPELINE | idem | `server/sheetsIngest.ts` | público |
| **Google Sheets** — Mídia (9 abas) | `pub?gid=N&output=csv` | `server/mediaInvestment.ts` | público |
| **Reportei** | iframe externo | `client/src/components/MidiaOnView.tsx` | sessão do user no Reportei |

### WaboxApp — funções concretas

| Função | Endpoint | Descrição |
|---|---|---|
| `checkInstanceStatus(token, uid)` | `GET /api/status/<uid>?token=...` | status, alias, platform, battery, plugged, locale, hook_url |
| `setHookUrl(token, uid, hookUrl)` | `POST /api/sethook` form-urlencoded | configura webhook |
| `sendTextMessage(token, uid, to, text, custom_uid)` | `POST /api/send/chat` form-urlencoded | envia mensagem |

### Sheets — caches

- `mediaInvestment.ts`: cache em memória **10 minutos**, single-flight (`_inflight`) pra deduplicar requests concorrentes
- `sheetsIngest.ts`: cache **60s** por URL

### Planilha de mídia — mapeamento gid→aba

```
gid=0           H.OLHOS - CATARATA
gid=1216857079  H.OLHOS - REFRATIVA
gid=300713107   HOPE - CATARATA
gid=1146549553  HOPE - REFRATIVA
gid=357997225   CBV - CATARATA
gid=1159198861  CBV - REFRATIVA
gid=1195793296  CBV - PLASTICA
gid=1982045300  SANTA LUZIA - CATARATA
gid=1580969915  SANTA LUZIA - REFRATIVA
```

---

## 9. Background workers

| Worker | Arquivo | Intervalo | Função |
|---|---|---|---|
| **Poller de instâncias** | `server/poller.ts` | 60s | bate `checkInstanceStatus` em todas as instâncias de todos os users (concorrência 5), atualiza status no DB, **preserva `instance.alias` local** (não sobrescreve com WaboxApp), grava status_log e broadcast SSE |
| **KeepAlive self-ping** | `server/keepAlive.ts` | 5min (delay inicial 30s) | `fetch /api/health` para evitar hibernação em proxies |

Ambos sobem em `_core/index.ts > startServer()`. Para desativar keep-alive:
`KEEP_ALIVE_ENABLED=false`.

### Engine de marcadores (no webhook)

Dentro do handler `/api/webhook/waboxapp` (event=message, dir=`i`):

1. Conta inbound do contato; só atua se ≤4
2. Busca as 4 primeiras mensagens inbound
3. `matchAllLabelsForMessages` roda todas as label_rules e devolve labels que casam
4. `applyLabelsToContact` insere em `contact_labels` (idempotente com
   `onConflictDoNothing` na PK `contactId+labelId`)

O guard `if (!hasLabel)` que existia antes **foi removido** — agora um contato
pode acumular múltiplos marcadores quando regras diferentes casam com
mensagens diferentes.

### Setup inicial do banco no boot

`ensureAuthSchema()` em `server/_core/migrate.ts`:

1. Adiciona colunas idempotentemente (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
2. Cria índice único em `users.username`
3. Cria seed users (rafael/caio) se não existirem
4. Define passwords default para usuários sem hash

---

## 10. Frontend — estrutura

### Rotas (`client/src/App.tsx`, Wouter)

| Path | Componente | Auth |
|---|---|---|
| `/` | `Monitor` se autenticado / `Login` se não | depende |
| `/404` | `NotFound` | — |
| `*` | `NotFound` | — |

### Páginas

| Arquivo | Função |
|---|---|
| `pages/Login.tsx` | Formulário username + password, logo Sougni animado |
| `pages/Monitor.tsx` | Layout principal com sidebar, header, area central com 6 views |
| `pages/NotFound.tsx` | 404 |

### Views do Monitor (`centerView` state)

| View | Componente | Quando aparece |
|---|---|---|
| `dashboard` | `OperationalDashV2` | inicial, qualquer role com `viewDashboard` |
| `operacao` | `OperationCenter` | KPIs em horário comercial |
| `contacts` | `ContactList` (de uma instância) | clique numa instância da sidebar |
| `global` | `GlobalContactsView` | botão "Todos os contatos" |
| `analytics` | `AnalyticsPanel` | analytics da instância |
| `midia` | `MidiaOnView` | iframe Reportei |

### Componentes principais

| Arquivo | Função |
|---|---|
| `InstanceSidebar` | lista instâncias com status dot, bateria, plugged |
| `InstanceDetailPanel` | header de uma instância (botões editar alias, refresh, remover) |
| `InstanceAliasEditor` | modal de renomear instância |
| `FilterBar` | filtros de data e marcador na ContactList |
| `HospitalFilter` | botões de hospital no dashboard |
| `MultiSelectFilter` | dropdown multi-select genérico |
| `DateRangePicker` | seletor global de período (DD/MM/AAAA) |
| `ConversationView` | timeline de mensagens de um contato |
| `ConversationSheet` | versão mobile-friendly da conversa |
| `RealtimePulseCard` | card do dashboard com último msg/contato e instâncias |
| `OperationalDashV2` | dashboard principal (9 seções) |
| `OperationCenter` | métricas TMA/TME/SLA com horário comercial |
| `AnalyticsPanel` | série diária de contatos |
| `LabelsModal` | CRUD marcadores + regras (com editar inline e confirm delete) |
| `ContactLabelsEditor` | popover multi-select de marcadores por contato |
| `ConfigModal` | input do token WaboxApp |
| `AddInstanceModal` | adicionar nova instância |
| `AdminMenu` | dropdown admin no header (Automação, Usuários) |
| `UsersManagerModal` | CRUD usuários (admin) |
| `AutomationRulesModal` | CRUD regras de automação (admin) |
| `OfflineAlert` | toast de instância caiu |
| `SougniLogo` | logo animado (hexágono lime + cubo) |
| `ErrorBoundary` | captura crash da árvore React |

### Hooks customizados (`client/src/hooks/`)

| Hook | Função |
|---|---|
| `usePermissions` | `{user, role, isAdmin, is(role), can(key), isLoading}` |
| `useSSE` | abre EventSource em `/api/sse?userId=` e dispara callbacks |
| `useAlertSound` | toca beep quando instância vai offline |
| `useComposition` | helper para IME (mensagens) |
| `useMobile` | breakpoint listener |
| `usePersistFn` | callback estável (ref) |
| `_core/hooks/useAuth` | template, hoje só `auth.me` via tRPC |

### Contexts

| Context | Função |
|---|---|
| `ThemeContext` | light/dark (default light, paleta Sougni) |
| `DateRangeContext` | período global do dashboard (preset 7d/30d/90d/...) |

### Libs (`client/src/lib/`)

| Arquivo | Função |
|---|---|
| `trpc.ts` | cliente tRPC + react-query, com `httpBatchLink` em `/api/trpc` |
| `formatPhone.ts` | normaliza `5511999...@c.us` → `+55 11 99...` |
| `utils.ts` | `cn(...)` (clsx + tailwind-merge) |

---

## 11. Fluxos críticos (passo a passo)

### A. Mensagem chega no WaboxApp → aparece na UI em tempo real

1. WhatsApp envia → WaboxApp
2. WaboxApp envia `POST /api/webhook/waboxapp` com `event=message`
3. Handler valida token → identifica `userId`
4. Localiza/cria contato (`upsertContact`)
5. Grava mensagem (`insertMessage`)
6. Se `dir=i` e contato tem ≤4 inbound → roda engine de labels (acumula via
   `applyLabelsToContact`)
7. Broadcast SSE `new_message` para o userId
8. Frontend (em `Monitor.tsx > useSSE`) recebe → invalida cache react-query
   das queries afetadas (`contacts.list`, `messages.list`)
9. UI re-renderiza com mensagem nova

### B. Usuário aplica 2+ marcadores manualmente em um lead

1. Lista de contatos mostra `ContactLabelsEditor` (botão "+ Marcar" ou
   badges existentes + "+")
2. Clique abre popover com todos os marcadores em checkbox
3. Marca quantos quer → `Salvar`
4. Frontend chama `contacts.setLabels({contactId, labelIds[]})`
5. Backend valida ownership do contato e dos labelIds
6. `setContactLabels` deleta linhas antigas de `contact_labels` do contato e
   re-insere as novas; sincroniza `contacts.labelId` legacy com o 1º label
7. Frontend invalida `contacts.list` + `contacts.listAll` → UI atualiza

### C. Renomear alias da instância (sem reverter)

1. Usuário clica lápis na instância → abre `InstanceAliasEditor`
2. Salva → `instances.updateAlias({id, alias})`
3. Backend faz `UPDATE instances SET alias = ?`
4. Poller (a cada 60s) chama `checkInstanceStatus` e:
   - Lê `instance.alias` do DB local
   - Sobrescreve no DB com `instance.alias ?? result.alias` — **prioriza o
     local** (o que você definiu); WaboxApp só serve de fallback se ainda
     não tem nenhum alias

### D. Login → primeira renderização do dashboard

1. `App > Router` chama `auth.me`
2. Se null → renderiza `Login`
3. Submit → `auth.login` seta cookie → `window.location.reload`
4. Re-chama `auth.me` → user existe → renderiza `Monitor`
5. `SessionRefresher` chama `auth.refresh` imediatamente (renova cookie)
6. `Monitor` chama em paralelo: `instances.list`, `config.get`,
   `dashboard.realtime`, `dashboard.overview`, `dashboard.mediaInvestment`,
   `dashboard.pipeline`...
7. `useSSE` abre EventSource

### E. Deploy automático no push

1. `git push origin main`
2. Render detecta push, roda `npm install`
3. Roda `npm run build`:
   - `vite build` → `dist/public/` (client)
   - `esbuild` → `dist/index.js` (server bundle)
4. Render reinicia o web service com `npm start`
5. `ensureAuthSchema()` roda no boot (idempotente, seguro)
6. Poller + KeepAlive iniciam

---

## 12. Convenções e gotchas

- `OWNER_ID = 1` está hardcoded em `routers.ts`. Tudo no DB se relaciona a esse
  ID. Se um dia for verdadeiramente multi-tenant, trocar pra `ctx.user.id`.
- **Sem FK no DB** — qualquer delete em cascata precisa ser feito em código.
  Adicionar uma nova tabela que referencia `labels`/`contacts`/`instances`?
  Lembra de incluir no `deleteX` correspondente em `db.ts`.
- **Cookie `sameSite: "none"`** exige HTTPS. Em dev local (http) usa `"lax"`.
- **`drizzle-kit migrate` NÃO é usado em prod** — só `ensureAuthSchema`.
  Mudanças destrutivas (DROP COLUMN, rename) precisam de migration manual via
  SQL no Render shell.
- **Nunca rodar `setupPipeline`** (Apps Script da planilha) sem confirmar — é
  destrutivo (apaga abas).
- **Não criar UI de proxy/clone de ads.google.com** — gestão de Google Ads
  só via API oficial.
- `applyLabelsToContact` é **idempotente** (`onConflictDoNothing` na PK
  composta). Pode chamar quantas vezes quiser sem duplicar.
- Webhook usa `application/x-www-form-urlencoded` com bracket notation. Express
  parseia automaticamente quando `extended: true`. Veja fallbacks no handler
  pra suportar tanto `contact.uid` (objeto) quanto `contact[uid]` (string raw).
- `passwordHash` é nullable nos `users` legados — login só funciona pra quem
  tem hash; novos users sempre nascem com hash (`hashPassword` bcrypt round 10).

---

## 13. Onde encontrar o quê — index reverso

| Quero ler/mexer em… | Vai em… |
|---|---|
| Schema do banco | `drizzle/schema.ts` |
| Migrations idempotentes | `server/_core/migrate.ts` |
| Setup SQL do zero | `deploy/setup.sql` |
| Endpoints tRPC | `server/routers.ts` |
| Lógica de DB (queries puras) | `server/db.ts` |
| Webhook + SSE + Express routes | `server/_core/index.ts` |
| Auth helpers (bcrypt, JWT, permissions) | `server/auth.ts` |
| tRPC context (cookie → user) | `server/_core/context.ts` |
| Middlewares (`protectedProcedure`, `adminProcedure`) | `server/_core/trpc.ts` |
| Env vars | `server/_core/env.ts` |
| Cliente WaboxApp REST | `server/waboxapp.ts` |
| Ingest CUSTOS/PIPELINE | `server/sheetsIngest.ts` |
| Ingest mídia paga (9 abas) | `server/mediaInvestment.ts` |
| Cálculo horário comercial (TMA/TME/SLA) | `server/businessHours.ts` |
| Poller de status | `server/poller.ts` |
| KeepAlive self-ping | `server/keepAlive.ts` |
| SSE broadcaster | `server/sse.ts` |
| Cliente tRPC + react-query | `client/src/lib/trpc.ts` |
| Login form | `client/src/pages/Login.tsx` |
| Layout principal | `client/src/pages/Monitor.tsx` |
| Permissões no UI | `client/src/hooks/usePermissions.ts` |
| Modal de marcadores + regras | `client/src/components/LabelsModal.tsx` |
| Editor multi-select de label num contato | `client/src/components/ContactLabelsEditor.tsx` |
| Editor de alias da instância | `client/src/components/InstanceAliasEditor.tsx` |
| Modal admin de usuários | `client/src/components/UsersManagerModal.tsx` |
| Modal admin de automation rules | `client/src/components/AutomationRulesModal.tsx` |
| Dashboard com 9 seções | `client/src/components/OperationalDashV2.tsx` |
| Centro de operação | `client/src/components/OperationCenter.tsx` |
| Iframe Reportei | `client/src/components/MidiaOnView.tsx` |
| Logo animado | `client/src/components/SougniLogo.tsx` |
| Theme tokens Sougni (lime, ink, off-white) | `client/src/index.css` |

---

_Última atualização: 2026-06-08 (commit das funcionalidades multi-label
manual + editar marcadores/regras)._

# Schema Roadmap — Conectar Dashboard V2 aos Dados Reais

Este documento descreve **TODAS as tabelas que precisam ser criadas** para alimentar
as métricas hoje mockadas no Dashboard V2 (`OperationalDashV2.tsx`).

> **Status atual:** o schema existente (`drizzle/schema.ts`) já cobre o backbone
> operacional (instances, contacts, messages, status_logs, labels). O que falta é
> a camada **comercial/financeira** que dá significado aos dados de conversa.

---

## Métricas vs. fonte de dados

| Métrica (Dashboard V2)          | Status hoje    | Origem real                                 |
|---------------------------------|----------------|---------------------------------------------|
| Tempo até 1º contato            | ✅ Real        | `messages` (já calculado)                   |
| Taxa de agendamento             | ❌ Mock        | Precisa `appointments`                      |
| Conversão cirurgia              | ❌ Mock        | Precisa `surgeries`                         |
| CAC por cirurgia                | ❌ Mock        | `media_spend` ÷ `surgeries`                 |
| Lead gerado / contatado         | ✅ Real        | `contacts` + `messages`                     |
| Consulta agendada / realizada   | ❌ Mock        | `appointments`                              |
| Cirurgia realizada              | ❌ Mock        | `surgeries`                                 |
| Investimento total              | ✅ Real        | `media_spend` (hoje Google Sheets, migrar)  |
| CTR / CPC / CPL                 | ✅ Real        | `media_spend`                               |
| Leads por campanha              | ❌ Mock        | `contact_attribution` (UTM tracking)        |
| Leads por cidade                | ❌ Mock        | `contact_attribution.city`                  |
| Leads por criativo              | ❌ Mock        | `contact_attribution.utm_content`           |
| Leads válidos / inválidos       | ✅ Real        | `messages` (heurística)                     |
| Taxa de contato (SDR)           | ✅ Real        | já feito por instância                      |
| Conversão por SDR               | ❌ Mock        | Precisa `sdrs` + `contact_assignment`       |
| Leads abandonados               | ❌ Mock        | `contact_status`                            |
| CAC por consulta                | ❌ Mock        | `media_spend` ÷ count(appointments)         |
| ROI / ROAS                      | ❌ Mock        | `revenue` ÷ `media_spend`                   |
| Receita gerada                  | ❌ Mock        | `surgeries.revenue` (ou tabela `revenue`)   |
| Performance por canal           | ❌ Mock        | `media_spend.channel` + attribution         |

---

## Novas tabelas necessárias

### 1. `sdrs` — Operadoras humanas

A planilha de "operadoras" hoje é mapeada para `instances` (uma instância WhatsApp).
Mas uma instância pode ter VÁRIOS humanos atendendo, e isso muda métricas como
"Conversão por SDR". Quando você for granular nisso, crie:

```ts
export const sdrs = pgTable("sdrs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }),
  // qual instância ela atende (pode ser null = atende todas)
  defaultInstanceId: integer("defaultInstanceId"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("sdrs_userId_idx").on(t.userId),
}));
```

**Como popular**: cadastro manual no painel. SDR também pode ter `whatsapp_uid` se
quiser inferir quem mandou cada `messages.direction = 'out'`.

### 2. `contact_assignment` — Qual SDR está cuidando do contato

Sem essa tabela, qualquer métrica "por SDR" precisa de heurística. Com ela é direto.

```ts
export const contactAssignment = pgTable("contact_assignment", {
  contactId: integer("contactId").primaryKey(),
  sdrId: integer("sdrId").notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  // se troca, basta sobrescrever (ou criar tabela de histórico se quiser auditoria)
});
```

### 3. `appointments` — Consultas agendadas e realizadas

O dado mais valioso. Cobre 4 métricas do dashboard.

```ts
export const appointmentStatusEnum = pgEnum("appointment_status",
  ["scheduled", "confirmed", "completed", "no_show", "canceled"]);

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  contactId: integer("contactId").notNull(),
  sdrId: integer("sdrId"),                      // quem agendou (opcional)
  hospital: varchar("hospital", { length: 64 }).notNull(), // HOPE / CBV / HOLHOS / SANTA LUZIA
  procedure: varchar("procedure", { length: 64 }).notNull(), // CATARATA / REFRATIVA / PLASTICA
  scheduledFor: timestamp("scheduledFor").notNull(),
  status: appointmentStatusEnum("status").default("scheduled").notNull(),
  completedAt: timestamp("completedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
}, (t) => ({
  contactIdx: index("appointments_contactId_idx").on(t.contactId),
  sdrIdx: index("appointments_sdrId_idx").on(t.sdrId),
  hospProcIdx: index("appointments_hospital_procedure_idx").on(t.hospital, t.procedure),
  scheduledIdx: index("appointments_scheduledFor_idx").on(t.scheduledFor),
}));
```

**Como popular**: integração com o sistema de gestão da clínica (HubResult, BotDesigner,
Google Sheets do agendador, etc) — ou cadastro manual via painel. Idealmente via API.

### 4. `surgeries` — Cirurgias realizadas (com receita)

Fecha o funil. Sem isso, não tem ROI, ROAS, Receita, CAC por cirurgia.

```ts
export const surgeries = pgTable("surgeries", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  contactId: integer("contactId").notNull(),
  appointmentId: integer("appointmentId"),      // se vinha de uma consulta
  hospital: varchar("hospital", { length: 64 }).notNull(),
  procedure: varchar("procedure", { length: 64 }).notNull(),
  revenue: integer("revenue").notNull(),         // centavos (BRL)
  performedAt: timestamp("performedAt").notNull(),
  surgeon: varchar("surgeon", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  contactIdx: index("surgeries_contactId_idx").on(t.contactId),
  hospProcIdx: index("surgeries_hospital_procedure_idx").on(t.hospital, t.procedure),
  performedIdx: index("surgeries_performedAt_idx").on(t.performedAt),
}));
```

### 5. `campaigns` — Campanhas de mídia (Google Ads / Meta Ads)

Hoje a planilha tem dado agregado por hospital+procedimento+canal. Pra ter
"Leads por campanha" individual, precisa estruturar.

```ts
export const campaignChannelEnum = pgEnum("campaign_channel", ["google", "meta", "tiktok", "linkedin", "other"]);

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  externalId: varchar("externalId", { length: 128 }),   // ID da campanha no Google/Meta
  name: varchar("name", { length: 256 }).notNull(),
  channel: campaignChannelEnum("channel").notNull(),
  hospital: varchar("hospital", { length: 64 }),         // null = não vinculada
  procedure: varchar("procedure", { length: 64 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

### 6. `creatives` — Criativos individuais (vídeo, imagem, carrossel)

Pra "Leads por criativo" funcionar com dados reais.

```ts
export const creativeTypeEnum = pgEnum("creative_type", ["video", "image", "carrossel", "story", "reel", "other"]);

export const creatives = pgTable("creatives", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaignId").notNull(),
  externalId: varchar("externalId", { length: 128 }),
  name: varchar("name", { length: 256 }).notNull(),
  type: creativeTypeEnum("type").notNull(),
  previewUrl: varchar("previewUrl", { length: 512 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

### 7. `contact_attribution` — De onde veio o lead

A peça que conecta lead → campanha → criativo. Sem ela, não dá pra fazer
"Leads por campanha/cidade/criativo".

```ts
export const contactAttribution = pgTable("contact_attribution", {
  contactId: integer("contactId").primaryKey(),
  campaignId: integer("campaignId"),
  creativeId: integer("creativeId"),
  utmSource: varchar("utm_source", { length: 128 }),
  utmMedium: varchar("utm_medium", { length: 128 }),
  utmCampaign: varchar("utm_campaign", { length: 256 }),
  utmContent: varchar("utm_content", { length: 256 }),
  utmTerm: varchar("utm_term", { length: 256 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 8 }),
  referrer: varchar("referrer", { length: 512 }),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});
```

**Como popular**:
- Landing page de captura envia UTM + cidade pro nosso webhook ANTES do contato no WhatsApp
- OU click-to-WhatsApp URL com pre-fill traz UTM no payload do WaboxApp
- Cidade: enriquecer via IP (MaxMind) ou pedir no formulário

### 8. `media_spend` — Investimento por dia/campanha (substitui Google Sheets)

Migra a planilha pra dado normalizado.

```ts
export const mediaSpend = pgTable("media_spend", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  campaignId: integer("campaignId").notNull(),
  date: timestamp("date").notNull(),
  impressions: integer("impressions").default(0).notNull(),
  clicks: integer("clicks").default(0).notNull(),
  costCents: integer("costCents").default(0).notNull(), // BRL em centavos
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  campaignDateIdx: uniqueIndex("media_spend_campaign_date_unique").on(t.campaignId, t.date),
}));
```

**Como popular**:
- API Google Ads (ETL diário, cron job 04:00)
- API Meta Marketing (idem)
- Mantém Google Sheets como fallback enquanto não migra tudo

### 9. `contact_status` — Status comercial do lead

Hoje "lead abandonado" não tem fonte; com isso fica explícito.

```ts
export const contactStatusEnum = pgEnum("contact_status",
  ["new", "contacted", "qualified", "appointment_scheduled", "appointment_done",
   "surgery_scheduled", "surgery_done", "abandoned", "lost", "unqualified"]);

export const contactStatus = pgTable("contact_status", {
  contactId: integer("contactId").primaryKey(),
  status: contactStatusEnum("status").default("new").notNull(),
  changedBy: integer("changedBy"),               // sdr_id (opcional)
  reason: varchar("reason", { length: 256 }),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
});
```

Pra histórico, criar `contact_status_history` com mesmo formato + `id serial`.

---

## Resumo: queries que vão funcionar com isso

```ts
// Taxa de agendamento
SELECT COUNT(DISTINCT a.contactId)::float / COUNT(DISTINCT c.id) * 100 AS rate
FROM contacts c
LEFT JOIN appointments a ON a.contactId = c.id AND a.scheduledFor BETWEEN $1 AND $2
WHERE c.createdAt BETWEEN $1 AND $2;

// Receita gerada
SELECT SUM(revenue)::float / 100 AS total_brl
FROM surgeries WHERE performedAt BETWEEN $1 AND $2;

// ROI
SELECT (SUM(s.revenue) - SUM(ms.costCents))::float / SUM(ms.costCents) * 100 AS roi_percent
FROM surgeries s, media_spend ms
WHERE s.performedAt BETWEEN $1 AND $2 AND ms.date BETWEEN $1 AND $2;

// Leads por campanha
SELECT cmp.name, COUNT(DISTINCT ca.contactId) AS leads
FROM contact_attribution ca
INNER JOIN campaigns cmp ON cmp.id = ca.campaignId
INNER JOIN contacts c ON c.id = ca.contactId
WHERE c.createdAt BETWEEN $1 AND $2
GROUP BY cmp.id, cmp.name ORDER BY leads DESC LIMIT 10;

// Conversão por SDR
SELECT sdr.name, COUNT(DISTINCT s.contactId)::float / COUNT(DISTINCT ca.contactId) * 100
FROM sdrs sdr
LEFT JOIN contact_assignment ca ON ca.sdrId = sdr.id
LEFT JOIN surgeries s ON s.contactId = ca.contactId
GROUP BY sdr.id, sdr.name;
```

---

## Ordem sugerida de implementação

| Prioridade | Tabela            | Desbloqueia                                     |
|------------|-------------------|-------------------------------------------------|
| 🔴 P0      | `appointments`    | Funil 3 níveis + Taxa de agendamento            |
| 🔴 P0      | `surgeries`       | Funil final + Receita + ROI/ROAS                |
| 🟡 P1      | `contact_status`  | Leads abandonados + estado comercial            |
| 🟡 P1      | `sdrs` + `contact_assignment` | Métricas individuais por SDR        |
| 🟢 P2      | `campaigns` + `creatives` + `contact_attribution` | Leads por campanha/criativo |
| 🟢 P2      | `media_spend`     | Migra Google Sheets pra DB                      |

**Estimativa**: P0 em 1 sprint (2 tabelas + 4 endpoints + 1 fluxo de cadastro);
P1 em mais 1 sprint; P2 quando vier integração formal com Google Ads/Meta APIs.

---

## Próximos passos imediatos

1. Definir como vão entrar appointments e surgeries (manual via painel? Webhook externo? API?)
2. Criar migration Drizzle (`pnpm drizzle-kit generate`) com as tabelas P0
3. Criar tela de cadastro/visualização de consulta + cirurgia no painel
4. Substituir os mocks do Dashboard V2 pelos endpoints reais um por vez
5. Manter os mocks como fallback quando ainda não há dado (período sem appointment)

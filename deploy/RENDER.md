# Deploy na Render — WaboxApp Monitor

Backend Node + Postgres na Render (free tier). Site estático sougni.com permanece no SiteGround.

---

## 1. Pré-requisitos

- Conta na Render: https://dashboard.render.com (signup free com GitHub)
- Repositório Git deste projeto (Render só faz deploy via Git — GitHub, GitLab ou Bitbucket)

---

## 2. Criar repositório Git

Se ainda não tem:

```bash
cd C:\Users\Rafael\waboxapp-monitor
git init -b main
git add -A
git commit -m "Initial commit"

# Cria repo privado em github.com/seu-user/waboxapp-monitor
# Depois:
git remote add origin git@github.com:seu-user/waboxapp-monitor.git
git push -u origin main
```

---

## 3. Deploy via Blueprint (1-clique)

Esta é a forma mais rápida — Render lê o `render.yaml` na raiz e cria tudo.

1. Render Dashboard → **New** → **Blueprint**
2. Conecta GitHub → autoriza acesso ao repo
3. Seleciona `waboxapp-monitor`
4. Render mostra: 1 Postgres + 1 Web Service. Confirma.
5. **Manual:** preenche `PANEL_PASSWORD` (senha do painel). O resto vem do blueprint.
6. Click **Apply**

Render vai:
- Criar Postgres free
- Buildar e subir o backend
- Conectar tudo
- Dar URL `https://waboxapp-monitor.onrender.com`

---

## 4. Criar schema no banco

Depois que o Postgres estiver up, no Render Dashboard → seu Postgres → **Shell** (canto inferior):

Cole o conteúdo de `deploy/setup.sql` inteiro e dê Enter. Vai criar todas as tabelas + o usuário fixo.

Alternativa via psql local (se tiver):

```bash
psql "postgresql://USER:PASS@HOST/DB" -f deploy/setup.sql
```

(Connection string completa está no Render Dashboard → seu Postgres → **Info** → External Database URL.)

---

## 5. Testar

Acesse `https://waboxapp-monitor.onrender.com/`

- Tela de login → digite a `PANEL_PASSWORD` que você setou
- Configurações → cola o token WaboxApp
- Adicione uma instância
- Configure o webhook na WaboxApp: `https://waboxapp-monitor.onrender.com/api/webhook/waboxapp`

---

## 6. Domínio customizado (opcional)

Se quiser `monitor.sougni.com` no lugar do `.onrender.com`:

1. Render Dashboard → Web Service → **Settings** → **Custom Domains**
2. Click **Add Custom Domain**, digite `monitor.sougni.com`
3. Render mostra um CNAME (algo como `waboxapp-monitor.onrender.com`)
4. No SiteGround → Site Tools → **Domain → DNS Zone Editor**
5. Cria registro CNAME: nome `monitor`, valor `<seu-app>.onrender.com`
6. Aguarda propagação (~5min) e SSL Let's Encrypt automático (~10min)

---

## 7. Limitações do free tier

| Recurso | Free tier | Impacto |
|---|---|---|
| Web service | Dorme após 15 min idle | Primeiro request após dormir leva ~30s. Webhooks WaboxApp podem ser perdidos durante esse tempo. |
| Postgres | 1GB + expira em 30 dias (depois $7/mês) | Suficiente pra começar |
| RAM | 512 MB | Funciona pro nosso caso |
| Build time | 500 min/mês | Mais que suficiente |

**Pra evitar sleep:**
- Use [UptimeRobot](https://uptimerobot.com) (free) pra pingar `/api/health` a cada 5min — mantém acordado
- Ou faça upgrade pro plano Starter ($7/mês) — sem sleep
- Ou mude pra Railway ($5 crédito free + $5/mês depois)

---

## 8. Atualizar código depois

```bash
# Local
git add -A
git commit -m "Update"
git push

# Render faz auto-deploy ao detectar push (default em branch main)
```

---

## Troubleshooting

| Sintoma | Fix |
|---|---|
| "Application failed to respond" | Render dorme. Espera 30s e recarrega. Considere UptimeRobot. |
| Tabela não existe | Rode `setup.sql` no Postgres Shell. |
| Erro SSL | `PGSSLMODE=require` deve estar setado. Já vem no `render.yaml`. |
| Webhook não recebe | URL deve ser HTTPS exato `https://APP.onrender.com/api/webhook/waboxapp`. Render só serve HTTPS, ok. |
| Cold start lento | É o sleep do free tier. Use UptimeRobot ou upgrade. |

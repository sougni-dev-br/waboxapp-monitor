# WaboxApp Monitor

Painel white-label de monitoramento de instâncias WhatsApp via [WaboxApp](https://www.waboxapp.com).

**Stack:** React 19 + Vite + Express + tRPC + Drizzle ORM + MySQL.

## Recursos

- Status em tempo real de múltiplas instâncias WhatsApp (online/offline/bateria)
- Histórico completo de conversas com envio de mensagens
- Dashboard operacional com KPIs, gráficos e heatmap de horários
- Sistema de marcadores (labels) com regras automáticas por palavra-chave
- Filtros por data e marcador, exportação XLSX
- Push em tempo real via Server-Sent Events
- Pulso ao vivo (msg/min, leads/hora, contato mais ativo)

## Desenvolvimento local

```bash
pnpm install
cp .env.example .env
# Preencher DATABASE_URL, JWT_SECRET, PANEL_PASSWORD
pnpm db:push   # cria schema no banco
pnpm dev
```

Abre em `http://localhost:3000` (ou próxima porta livre).

## Deploy em produção

Veja [`deploy/DEPLOY.md`](deploy/DEPLOY.md) — guia passo-a-passo para SiteGround Cloud em `sougni.com/monitor`.

## Estrutura

```
client/          Frontend React + Vite
server/          Backend Express + tRPC
drizzle/         Schema e migrations
shared/          Tipos e constantes compartilhadas
deploy/          Artifacts de deploy (SQL, htaccess, guia)
```

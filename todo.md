# WaboxApp Monitor - TODO

## Backend
- [x] Schema do banco de dados (users, api_configs, instances, contacts, messages, status_logs)
- [x] Migração do banco de dados
- [x] Helpers de DB (getInstances, getContacts, getMessages, upsertContact, insertMessage, etc.)
- [x] Serviço WaboxApp (checkInstanceStatus, sendTextMessage)
- [x] Router tRPC: config (get, save)
- [x] Router tRPC: instances (list, add, remove, checkStatus, statusLogs)
- [x] Router tRPC: contacts (list)
- [x] Router tRPC: messages (list)
- [x] Webhook receiver POST /api/webhook/waboxapp
- [x] SSE endpoint GET /api/sse para push em tempo real
- [x] Poller automático de status a cada 30 segundos
- [x] Broadcast SSE: instance_status_changed, instance_status_update, new_message, message_ack

## Frontend
- [x] Design system branco elegante (inspirado em OpenAI/Apple)
- [x] Página de Login com features listadas
- [x] Página Monitor principal com layout chatbot
- [x] Sidebar de instâncias com status dots (online/offline/unknown)
- [x] Indicador de bateria e plataforma na sidebar
- [x] Painel de detalhes da instância (status, bateria, plataforma, locale)
- [x] Botão de verificar status manualmente
- [x] Botão de remover instância com confirmação
- [x] Lista de contatos com busca em tempo real
- [x] Exportação de contatos para XLSX
- [x] Histórico de conversas em formato de chat (msg-in / msg-out)
- [x] Suporte a todos os tipos de mensagem (chat, image, video, audio, ptt, document, vcard, location)
- [x] ACK indicator (○ / ✓ / ✓✓ / ✓✓ azul)
- [x] Agrupamento de mensagens por data
- [x] Auto-scroll para última mensagem
- [x] Modal de configuração do token API
- [x] Cópia da URL do webhook com feedback visual
- [x] Modal de adição de instância
- [x] Hook useSSE para eventos em tempo real
- [x] Hook useAlertSound com Web Audio API
- [x] Componente OfflineAlert com animação e efeito sonoro
- [x] Resumo de status no header (X online / Y offline)
- [x] Polling fallback a cada 35 segundos no frontend
- [x] Invalidação automática de queries via SSE

## Testes
- [x] Testes vitest: config router (get, save)
- [x] Testes vitest: instances router (list, add com erro, add duplicado, add sucesso)
- [x] Testes vitest: auth router (me)
- [x] Teste original: auth.logout

## Pendente / Melhorias futuras
- [ ] Paginação de mensagens (scroll infinito)
- [ ] Envio de mensagens diretamente pelo painel
- [ ] Filtro de instâncias por status
- [ ] Notificações push via browser
- [ ] Dashboard com gráficos de uptime
- [ ] Exportação de histórico de conversas

## Bugs corrigidos
- [x] Mensagens recebidas via webhook não aparecem como novo contato
- [x] Histórico de conversas não é salvo/exibido
- [x] Parsing dos campos do webhook: express.urlencoded(extended:true) converte bracket notation em objetos aninhados (body.contact.uid, body.message.body.text) - corrigido para usar objetos aninhados com fallback para bracket notation

## Envio de Mensagens (nova feature)
- [x] Backend: helper sendChatMessage(token, uid, to, text, customUid) no waboxapp.ts
- [x] Backend: procedure tRPC messages.send (instanceId, contactId, contactUid, text)
- [x] Frontend: campo de input na ConversationView com botão de enviar
- [x] Frontend: suporte a Enter para enviar e Shift+Enter para nova linha
- [x] Frontend: otimistic update - mensagem aparece imediatamente antes do ACK
- [x] Frontend: indicador de loading/enviando no botão
- [x] Frontend: feedback de erro se envio falhar (toast)
- [x] Frontend: desabilitar input quando instância está offline
- [x] Frontend: banner de aviso quando instância está offline na conversa
- [x] Frontend: auto-resize do textarea conforme o texto cresce

## Sprint 2 - Analytics, Marcadores e Polling
- [x] Schema: tabela `labels` (marcadores com nome e cor)
- [x] Schema: tabela `label_rules` (keyword → label_id)
- [x] Schema: campo `labelId` na tabela `contacts`
- [x] DB push com novas migrações
- [x] Backend: query de contador diário de contatos novos por instância
- [x] Backend: procedure analytics.dailyContacts
- [x] Backend: engine de marcadores - aplicar regra na primeira mensagem recebida
- [x] Backend: CRUD de labels (criar, listar, deletar)
- [x] Backend: CRUD de label_rules (criar, listar, deletar)
- [x] Frontend: aba/seção de analytics com gráfico de barras de contatos por dia
- [x] Frontend: modal de gerenciamento de marcadores e regras
- [x] Frontend: badge de marcador na lista de contatos
- [x] Frontend: polling automático a cada 60 segundos em todas as queries
- [x] Frontend: indicador "Atualizado às HH:MM" no painel

## Sprint 3 - Filtro de Data na Lista de Contatos
- [x] Backend: procedure contacts.list aceita filtros dateFrom e dateTo (firstMessageAt)
- [x] Backend: query retorna campo firstMessageAt para cada contato
- [x] Frontend: DateRangePicker (de/até) no header da ContactList
- [x] Frontend: exibir "Entrada: DD/MM/YYYY" em cada contato
- [x] Frontend: contagem de contatos atualiza conforme filtro aplicado
- [x] Frontend: botão "Limpar filtro" quando filtro ativo
- [x] Frontend: exportação XLSX inclui coluna "Primeira Mensagem"

## Sprint 4 - Filtros Avançados (Data DD/MM/AAAA + Marcadores + Visão Global)
- [x] Backend: procedure contacts.listAll (todas instâncias) com filtros dateFrom, dateTo, labelId
- [x] Backend: procedure contacts.list (por instância) adiciona filtro labelId
- [x] Frontend: componente FilterBar reutilizável com DatePicker DD/MM/AAAA e seletor de marcadores
- [x] Frontend: ContactList usa FilterBar com filtro de data DD/MM/AAAA + marcadores
- [x] Frontend: GlobalContactsView com lista de todos os contatos de todas as instâncias
- [x] Frontend: GlobalContactsView usa FilterBar com mesmos filtros
- [x] Frontend: Monitor.tsx adiciona botão "Todos os Contatos" no header e na EmptyState
- [x] Frontend: exportação XLSX disponível na visão global também

## Sprint 5 - Acesso Público (sem login Manus) [CONCLUÍDO]
- [x] Remover fluxo OAuth Manus do frontend
- [x] Implementar login simples com senha própria (PIN/senha configurável)
- [x] Backend: todas as procedures usam publicProcedure (sem sessão Manus)
- [x] Backend: autenticação própria via JWT com senha definida em env
- [x] Frontend: tela de login simples com campo de senha
- [x] Frontend: sessão salva em cookie JWT de 30 dias
- [x] Gerar HTML com iframe fullscreen para acoplar no site da IRMZ

## Sprint 6 - Dashboard Operacional (Gestor) [CONCLUÍDO]
- [x] Backend: procedure dashboard.overview com KPIs principais
- [x] Backend: volume de leads por dia (últimos 30 dias)
- [x] Backend: distribuição por etiquetas/marcadores
- [x] Backend: status das instâncias (online/offline/uptime %)
- [x] Backend: top instâncias por volume de mensagens
- [x] Backend: novos contatos hoje vs ontem vs semana
- [x] Backend: horários de pico de mensagens
- [x] Frontend: componente OperationalDash com KPI cards animados (gerado via API Anthropic Claude)
- [x] Frontend: gráfico de linha de leads por dia (Recharts)
- [x] Frontend: gráfico de rosca de distribuição por etiquetas
- [x] Frontend: heat map de horários de pico
- [x] Frontend: tabela de status das instâncias com uptime %
- [x] Frontend: navegação Dashboard + Todos os Contatos na sidebar (acima de Instâncias)
- [x] Revisão completa de UI/UX: sidebar reestruturada com hierarquia clara

## Bugs - Sprint 6
- [x] Dashboard: "Erro ao carregar dados" - corrigido: queries DATE()/HOUR() usavam interpolação Drizzle que gerava nomes de coluna sem prefixo de tabela, causando ambiguidade no MySQL. Corrigido para usar strings SQL literais com nome qualificado (contacts.createdAt, messages.createdAt)

## Sprint 7 - DateRangePicker no Dashboard
- [x] Backend: procedure dashboard.overview aceita dateFrom e dateTo opcionais
- [x] Frontend: DateRangePicker com calendário (De/Até) no OperationalDash
- [x] Frontend: todos os KPIs e gráficos filtrados pelo período selecionado

## Sprint 8 - Card Pulso em Tempo Real
- [x] Backend: procedure dashboard.realtime com msgsLast1min/5min/15min/1h, in/out, leads/1h, última msg, contato mais ativo, status de instâncias, bateria baixa, feed recente (10 msgs 24h)
- [x] Frontend: componente RealtimePulseCard com velocidade de mensagens, barras animadas, direção in/out, leads ao vivo, status de instâncias com bateria, última mensagem, contato mais ativo, feed de eventos
- [x] Frontend: polling a cada 10s com animação de counter ao atualizar
- [x] Integração no OperationalDash entre KPI cards e gráficos

## Sprint 9 - Dashboard em Tempo Real (ciclo máximo 1 minuto)
- [x] Poller de instâncias: reduzido para 60s com broadcast SSE `dashboard_refresh` ao final de cada ciclo
- [x] SSE: ao receber new_message/instance_status_changed/instance_status_update, invalidar dashboard.overview e dashboard.realtime
- [x] OperationalDash: refetchInterval 60_000ms + refetchIntervalInBackground: true
- [x] RealtimePulseCard: refetchInterval 10s + refetchIntervalInBackground: true (mantido)
- [x] Monitor.tsx: handler dashboard_refresh invalidando overview + realtime + instances; instances.list com refetchIntervalInBackground: true

## Sprint 11 - Auditoria Claude Anthropic: Refatoração Completa UX/UI + Realtime
- [x] useSSE: reescrito com cleanup correto de listeners (sem memory leak), sem stale closures, reconexão robusta
- [x] OperationalDash: debounce de 300ms no handleSSERefresh (evita flood de invalidações)
- [x] OperationalDash: queryInput estável com strings primitivas (evita re-renders infinitos)
- [x] OperationalDash: sseEnabled só ativo após auth carregado (evita erro 401 no SSE)
- [x] OperationalDash: staleTime de 30s no overview (evita race condition SSE vs polling)
- [x] RealtimePulseCard: mesmas correções de authLoading aplicadas
- [x] dashboard.realtime: corrigido de publicProcedure para protectedProcedure (segurança)
- [x] getRealtimePulse: corrigido N+1 queries (1 query para todos os contatos do feed)
- [x] Webhook: não loga mais tokens parcialmente (segurança)
- [x] Poller: processamento paralelo de instâncias com Promise.allSettled
- [x] Poller: só envia dashboard_refresh SSE se houver clientes conectados
- [x] sse.ts: adicionada função hasConnectedClients()

## Sprint 10 - Correção: Lead novo não aparece no Dashboard em tempo real
- [x] Auditoria: webhook correto (broadcastToUser chamado na linha 238 do index.ts)
- [x] Auditoria: useSSE registrava listeners apenas no momento da conexão - novos eventos não eram registrados
- [x] Correção: useSSE reescrito para registrar listeners dinamicamente e ao reconectar
- [x] Correção: OperationalDash agora usa useSSE próprio (new_message, dashboard_refresh, instance_status_changed, instance_status_update)
- [x] Correção: RealtimePulseCard agora usa useSSE próprio (new_message, dashboard_refresh) para invalidação imediata

## Sprint 12 - Label Rules: verificar 4 primeiras mensagens (não apenas a 1ª)
- [x] Localizar lógica de aplicação de label rules no webhook handler
- [x] Corrigir para buscar as 4 primeiras mensagens do contato e verificar todas
- [x] Testar e salvar checkpoint

## Sprint 13 - Botão "Reaplicar Regras" retroativo
- [x] Backend: procedure labelRules.reapply que processa contatos sem label
- [x] Frontend: botão com loading, resultado (X tabulados) e confirmação
- [x] Testar e salvar checkpoint

## Sprint 14 - Múltiplos marcadores por contato [CONCLUÍDO]
- [x] Backend: nova tabela contact_labels (contactId, labelId, unique) + migração de dados existentes
- [x] Backend: matchAllLabelsForMessages retorna TODOS os labels que fazem match
- [x] Backend: applyLabelsToContact insere múltiplos labels via INSERT IGNORE
- [x] Backend: webhook handler aplica todos os labels que fazem match
- [x] Backend: reapply retroativo aplica múltiplos labels por contato
- [x] Backend: contacts.list e contacts.listAll retornam array labels[] por contato
- [x] Frontend: ContactList exibe múltiplos badges de label por contato
- [x] Testar e salvar checkpoint

## Sprint 15 - Sessão sempre ativa [CONCLUÍDO]
- [x] JWT: aumentar validade de 30 dias para 1 ano (365d)
- [x] Backend: procedure auth.refresh (protectedProcedure) que emite novo JWT de 1 ano
- [x] Frontend: SessionRefresher renova o token imediatamente ao montar e a cada 7 dias
- [x] Cookie: maxAge atualizado para 365 dias em login e refresh

## Sprint 16 - Servidor sempre ativo (Keep-Alive) [CONCLUÍDO]
- [x] Self-ping no servidor: setInterval a cada 5 min fazendo GET /api/health
- [x] Job agendado Manus: ping externo a cada 5 min para o domínio publicado

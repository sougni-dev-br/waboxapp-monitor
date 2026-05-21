# Deploy SiteGround Cloud — WaboxApp Monitor

Guia passo-a-passo para subir o painel em `sougni.com/monitor`.

---

## 0. Pré-requisitos

- SiteGround Cloud Hosting ativo (`sougni.com` apontado)
- Acesso SSH como root (Site Tools → Devs → SSH Keys Manager)
- Node.js 20+ instalado no servidor (ou usar `nvm`)
- PM2 global (`npm i -g pm2`)
- Banco MySQL criado (vou fazer no passo 2)

---

## 1. Conectar via SSH

No seu PC:

```bash
ssh -i ~/.ssh/sua_chave usuario@servidor.sg-host.com
```

(Site Tools → SSH Keys Manager → Manage → "Show Server Info" pra pegar host/porta/user.)

---

## 2. Criar o banco MySQL

No Site Tools:

1. **Site → MySQL → Databases**: clicar **Create Database**
   - Nome: `sougni_waboxapp` (vai virar `sougni_waboxapp` com prefixo do usuário, ex `xxxxx_sougni_waboxapp`)
2. **Users**: criar usuário
   - Nome: `sougni_wabox` (idem prefixado)
   - Senha forte (anotar — vai pro `.env`)
3. **Manage Access**: dar permissão **All Privileges** do usuário no banco
4. Anotar host (geralmente `localhost` quando o Node roda no mesmo servidor)

Importar schema:

```bash
# No servidor, após enviar o repo:
mysql -h localhost -u USUARIO -p NOME_DO_BANCO < deploy/setup.sql
```

(O `setup.sql` cria todas as tabelas + insere o usuário fixo do painel.)

---

## 3. Enviar o código

Da sua máquina local:

```bash
# Da raiz do projeto (waboxapp-monitor/)
rsync -avz --exclude node_modules --exclude dist --exclude .git \
  ./ usuario@servidor.sg-host.com:~/apps/waboxapp-monitor/
```

Ou via `scp` / `git clone` de um repo privado.

---

## 4. Instalar deps e buildar (no servidor)

```bash
ssh usuario@servidor.sg-host.com
cd ~/apps/waboxapp-monitor

# Instala pnpm globalmente (se ainda não tem)
npm i -g pnpm pm2

# Instala dependências
pnpm install --frozen-lockfile=false

# Cria .env a partir do template
cp .env.example .env
nano .env   # preenche DATABASE_URL, JWT_SECRET, PANEL_PASSWORD

# Gera segredos seguros (cole no .env):
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Build
pnpm build
```

`pnpm build` gera:
- `dist/public/` — frontend estático
- `dist/index.js` — backend bundle

---

## 5. Subir com PM2

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # copie e cole o comando que ele imprime (systemd)

# Validar:
pm2 status
pm2 logs waboxapp-monitor --lines 50
curl http://127.0.0.1:3000/api/health
# Deve responder: {"ok":true,"ts":...}
```

---

## 6. Configurar Apache reverse proxy

### Opção A — via `.htaccess` (mais simples)

No Site Tools → File Manager, abra o `.htaccess` da raiz do `sougni.com` (ou crie):

Cole o conteúdo de `deploy/htaccess-sougni.com.txt`.

### Opção B — via vhost direto (mais robusto)

Se a opção A não funcionar (alguns planos bloqueiam `[P]` em `.htaccess`):

```bash
sudo nano /etc/apache2/sites-available/sougni.com.conf
```

Cole o conteúdo de `deploy/vhost-monitor.conf` dentro do bloco `<VirtualHost>` apropriado.

```bash
sudo apachectl configtest
sudo systemctl reload apache2
```

---

## 7. Testar no browser

Abrir: `https://sougni.com/monitor/`

Deve aparecer a tela de login. Senha = `PANEL_PASSWORD` do `.env`.

Se vier erro:

```bash
# Logs do app
pm2 logs waboxapp-monitor

# Logs do Apache
sudo tail -f /var/log/apache2/error.log
```

---

## 8. Configurar webhook na WaboxApp

Para cada instância cadastrada no painel WaboxApp:

- **Hook URL:** `https://sougni.com/monitor/api/webhook/waboxapp`

Adicione token via painel após login. Adicione instância. Pronto.

---

## 9. Atualizações futuras

```bash
ssh usuario@servidor.sg-host.com
cd ~/apps/waboxapp-monitor

# Recebe novos arquivos (rsync de novo, ou git pull)
pnpm install --frozen-lockfile=false  # se package.json mudou
pnpm build
pm2 restart waboxapp-monitor
```

---

## 10. Backup do banco

```bash
mysqldump -h localhost -u USUARIO -p NOME_DO_BANCO \
  | gzip > ~/backups/waboxapp-$(date +%Y%m%d).sql.gz
```

Adicione via Site Tools → Devs → Cron Jobs para rodar diário.

---

## Troubleshooting

| Sintoma | Causa provável | Fix |
|---|---|---|
| 502 Bad Gateway em /monitor | Node não está rodando | `pm2 status` / `pm2 restart waboxapp-monitor` |
| Tela em branco | Base path errado, assets 404 | Confirmar `vite.config.ts` com `base: '/monitor/'` e rebuild |
| Login dá 401 imediatamente | Cookie path errado | Confirmar `COOKIE_PATH=/monitor` no `.env` |
| SSE desconecta | Apache buffering / timeout curto | Conferir `ProxyTimeout 3600` e `X-Accel-Buffering: no` |
| Webhook 404 | URL errada na WaboxApp | Conferir `https://sougni.com/monitor/api/webhook/waboxapp` |
| `pnpm: command not found` | Não instalado global | `npm i -g pnpm` |
| MySQL `Access denied` | Permissões | Site Tools → MySQL → Manage Access → All Privileges |

---

## Checklist final

- [ ] Banco criado e `setup.sql` rodado
- [ ] `.env` preenchido (DATABASE_URL, JWT_SECRET, PANEL_PASSWORD, COOKIE_PATH)
- [ ] `pnpm build` rodou sem erro
- [ ] `pm2 status` mostra `waboxapp-monitor: online`
- [ ] `curl localhost:3000/api/health` retorna `{ok:true}`
- [ ] `https://sougni.com/monitor/` carrega tela de login
- [ ] Login com senha funciona
- [ ] Token WaboxApp configurado
- [ ] Webhook URL atualizado na WaboxApp
- [ ] Primeira instância adicionada e pollou pelo menos 1 vez

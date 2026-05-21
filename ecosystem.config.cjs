/**
 * PM2 ecosystem para WaboxApp Monitor.
 *
 * Uso no SiteGround Cloud:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup    # gera comando systemd para auto-start no boot
 *
 * Logs:
 *   pm2 logs waboxapp-monitor
 *   pm2 logs waboxapp-monitor --lines 200
 *
 * Restart:
 *   pm2 restart waboxapp-monitor
 *
 * Status:
 *   pm2 status
 */
module.exports = {
  apps: [
    {
      name: "waboxapp-monitor",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      // Carrega .env automaticamente via dotenv/config no index.ts
      env: {
        NODE_ENV: "production",
      },
      // Logs separados (rotativos via pm2-logrotate)
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      // Em caso de crash, espera antes de tentar de novo
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};

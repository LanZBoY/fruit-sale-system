import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { initRealtime } from './lib/realtime.js';
import { migrate } from './db/migrate.js';

async function main() {
  // 啟動時自動跑 migration + seed（docker compose up 即可呈現）
  await migrate();

  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);

  server.listen(config.port, () => {
    console.log(`[server] API 已啟動於 http://0.0.0.0:${config.port}/api/v1`);
  });
}

main().catch((err) => {
  console.error('[server] 啟動失敗', err);
  process.exit(1);
});

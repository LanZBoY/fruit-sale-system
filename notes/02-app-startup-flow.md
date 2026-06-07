# 02 · 後端啟動流程：migration 在哪裡被呼叫

## 重點

migration **不是**在 `app.js`，也**不是**靠 Dockerfile 拆 init/app 兩個 process。
它是在進入點 `server.js` 裡、`listen` 之前直接 `await migrate()`，**單一進程內**完成。

`app.js` 只負責「組」Express app（`createApp()`），不 listen、不 migrate。

## 啟動鏈

```
docker-compose.yml  backend depends_on db (condition: service_healthy)
        │           → 等 DB healthcheck 過才起 backend
        ▼
Dockerfile          CMD ["npm","start"] → node src/server.js（單一進程）
        ▼
server.js           await migrate()  ← 跑完才 listen
        ▼
migrate.js          waitForDb() 重試 30 次（二次保險）→ node-pg-migrate up → seed()
```

```js
// server.js
async function main() {
  await migrate();          // ← 就在這
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(config.port, ...);
}
```

## 這種設計的取捨

**好處**：簡單，`docker compose up` 一鍵就有資料可看（適合 demo / 學習）。

**代價（正式環境要注意）**：
1. **多副本會搶 migration** — 多 replica 時每個進程都會跑一次，靠 `pgmigrations` 表 + lock 大致擋住，但同時啟動仍可能 race。
2. **migration 失敗 = app 起不來**（`main().catch` → `process.exit(1)`），schema 與 code 部署強耦合。
3. **每次重啟都 re-seed** — 要確認 `seed.js` 是冪等的，否則重啟塞重複資料。

**正式環境升級路徑**：把 migration 抽成一次性 job（compose 的一次性 service `command: npm run migrate:up`，或 k8s initContainer），app 進程只負責 listen。

# 🍊 水果銷售出貨系統 (Fruit Sales & Shipping System)

[![CI](https://github.com/LanZBoY/fruit-sale-system/actions/workflows/ci.yml/badge.svg)](https://github.com/LanZBoY/fruit-sale-system/actions/workflows/ci.yml)

依據 `specs/` 規格實作的全端專案：銷售組送單 → 出貨組即時接單備貨 → 管理後台統計。

- **前端**：React 18 + Vite + Tailwind CSS + React Query + Socket.IO（PWA，可安裝、支援 Web Push）
- **後端**：Node.js + **TypeScript** + Express + PostgreSQL + Socket.IO + JWT(argon2)；Vitest 測試（unit + Testcontainers 整合測試）
- **資料庫遷移**：node-pg-migrate（版本化、可回滾，因應需求變更）
- **部署**：Docker Compose 一鍵啟動（db + backend + frontend）

---

## 🚀 快速啟動（Docker Compose）

只要安裝 Docker，於專案根目錄執行：

```bash
docker compose up --build
```

啟動後：

| 服務 | 網址 |
|------|------|
| 前端 PWA | http://localhost:8080 |
| 後端 API | http://localhost:3000/api/v1 |
| PostgreSQL | localhost:5433（帳密 fruit / fruit） |

後端啟動時會 **自動執行資料庫 migration 與初始資料 seed**，無需手動操作。

### 預設帳號

| 帳號 | 密碼 | 角色 | 說明 |
|------|------|------|------|
| `root` | `root1234` | admin | Root 超級管理員 |
| `admin` | `admin123` | admin | 管理者 |
| `sales` | `sales123` | sales | 銷售組 |
| `shipper` | `shipper123` | shipper | 出貨組 |

> ⚠️ 正式環境請務必更換密碼與 JWT 金鑰（見根目錄 `.env.example`）。

---

## 🧭 體驗流程

1. 用 `sales` 登入（手機介面）→ 建立訂單 → 送出。
2. 用 `shipper` 登入（另一瀏覽器/手機）→ 待出貨清單會 **即時** 浮現新訂單（音效 + 紅點）→ 按「開始備貨 / 完成出貨」。
3. 用 `admin` 登入（電腦介面）→ 儀表板看今日營收、銷售排行；訂單紀錄、商品管理、客戶、出貨總覽、使用者管理。

出貨組任何畫面 **皆不顯示金額**（後端層級過濾，非僅前端隱藏）。

---

## 🗂️ 專案結構

```
fruit-sales-system/
├── docker-compose.yml      # 一鍵啟動
├── .env.example            # 金鑰 / VAPID 設定範例
├── specs/                  # 規格文件
├── backend/                # Express API（TypeScript）
│   ├── migrations/         # node-pg-migrate 遷移檔
│   ├── tsconfig.json       # TS 設定（strict + NodeNext）
│   ├── src/
│   │   ├── server.ts       # 進入點（啟動時自動 migrate + seed）
│   │   ├── app.ts          # Express 應用
│   │   ├── types.ts        # 共用資料型別；express.d.ts 擴充 req.user
│   │   ├── db/             # 連線池 / 遷移 / seed
│   │   ├── lib/            # auth / errors / realtime / push / tz
│   │   ├── middleware/     # JWT 驗證 + RBAC
│   │   └── routes/         # auth/products/customers/orders/stats/users/push
│   ├── test/               # Vitest：unit（純函式）+ integration（Testcontainers）
│   └── Dockerfile          # 多階段：tsc 編譯 → dist
└── frontend/               # React PWA
    ├── src/
    │   ├── pages/          # login / sales / shipper / admin
    │   ├── components/     # 版面與路由守衛
    │   ├── context/        # Auth / Toast
    │   ├── hooks/          # useSocket
    │   └── sw.js           # 自訂 Service Worker（離線 + Web Push）
    ├── nginx.conf          # 反向代理 /api、/uploads、/socket.io
    └── Dockerfile
```

---

## 🛠️ 本機開發（不使用 Docker）

需要本機有 PostgreSQL。

**後端**
```bash
cd backend
cp .env.example .env          # 設定 DATABASE_URL
npm install
npm run migrate:up            # 執行遷移
npm run seed                  # 建立示範資料
npm run dev                   # http://localhost:3000
```

**前端**
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173（自動代理 API 到 :3000）
```

---

## 🔄 資料庫遷移（需求變更時）

採用 [`node-pg-migrate`](https://github.com/salsita/node-pg-migrate)，遷移檔在 `backend/migrations/`。

```bash
cd backend
npm run migrate:create -- add_discount_to_orders   # 產生新遷移檔（SQL）
npm run migrate:up                                  # 套用
npm run migrate:down                                # 回滾一步
```

新遷移檔以 `-- Up Migration` / `-- Down Migration` 分隔上下行。容器每次啟動會自動套用所有未執行的遷移。

---

## 🔔 啟用 Web Push（選配）

出貨組背景推播需要 VAPID 金鑰：

```bash
cd backend && npx web-push generate-vapid-keys
```

把產生的公私鑰填入根目錄 `.env`（`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`），重新 `docker compose up --build`。
出貨組登入後點「🔔 開啟通知」即可訂閱。

> 註：Web Push 需 HTTPS（`localhost` 例外可測試）。

---

## 📡 API 摘要

統一前綴 `/api/v1`，回應格式 `{ "data": ... }` 或 `{ "error": { "code", "message" } }`。

- `POST /auth/login`、`/auth/refresh`、`/auth/logout`、`GET /auth/me`
- `GET/POST/PUT /products`、`PATCH /products/:id/listing`、`POST /products/:id/image`
- `GET/POST /customers`、`GET /customers/:id`
- `POST /orders`、`GET /orders`、`/orders/mine`、`/orders/shipping`、`/orders/:id`、`PATCH /orders/:id/status`
- `GET /stats/summary`、`/stats/product-ranking`、`/stats/orders`
- `GET/POST/PUT /users`、`PATCH /users/:id/active`
- `GET /push/public-key`、`POST/DELETE /push/subscribe`

即時事件（Socket.IO）：`order.created`、`order.status_changed`、`inventory.updated`。

詳見 `specs/02-backend-spec.md`。
```

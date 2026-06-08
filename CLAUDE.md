# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

水果銷售出貨系統 — a full-stack app implementing the specs in `specs/`. Sales team submits orders → shipping team receives them in real time and prepares stock → admin sees statistics. Three roles: `sales` (mobile), `shipper` (mobile), `admin` (desktop). Built spec-first; `specs/00-overview.md`, `01-frontend-spec.md`, `02-backend-spec.md` are the source of truth for behavior, and `Backlog.md` tracks progress.

- **backend/** — Node.js + TypeScript + Express + PostgreSQL + Socket.IO, JWT auth (argon2)
- **frontend/** — React 18 + Vite + Tailwind + React Query + Socket.IO, PWA with Web Push

## Commands

All backend commands run from `backend/`; frontend from `frontend/`.

**Backend**
```bash
npm run dev            # tsx watch — runs src/server.ts directly, no build needed
npm run build          # tsc → dist/
npm run typecheck      # tsc --noEmit (this is what CI gates on)
npm run migrate:up     # apply migrations
npm run migrate:down   # roll back one
npm run migrate:create -- add_foo   # new SQL migration in migrations/
npm run seed           # seed demo data (default accounts + products)

npm test               # vitest run — unit + integration
npm run test:unit      # pure-function tests only, no DB/Docker
npm run test:integration   # Testcontainers postgres + real SQL
npm run test:cov       # with coverage
npx vitest run test/unit/tz.test.js          # a single file
npx vitest run -t "建立訂單"                  # by test name
```

**Frontend**
```bash
npm run dev       # Vite dev server on :5173, proxies /api /uploads /socket.io → :3000
npm run build     # production build (PWA)
```

**Whole stack**
```bash
docker compose up --build   # db(:5433) + backend(:3000) + frontend(:8080)
```
Backend auto-runs migrations + seed on startup (`server.ts` → `migrate()`), so `docker compose up` gives a working system with no manual steps. Default accounts: `root/root1234`, `admin/admin123`, `sales/sales123`, `shipper/shipper123`.

## Architecture notes that span files

**TypeScript + NodeNext ESM.** `tsconfig.json` uses `module: NodeNext`, so all relative imports in `.ts` source carry a `.js` extension (e.g. `import { config } from './config.js'` resolves `config.ts`). Keep this convention when adding files. Dev uses `tsx` (no build); production builds to `dist/` via `tsc`.

**Tests are `.js`, source is `.ts`.** Test files in `backend/test/` import source as `../../src/app.js` — Vitest resolves these to the `.ts` source. Two Vitest projects (`vitest.config.ts`): `unit` (pure functions, no DB) and `integration` (real Postgres). Integration tests run **serially** (`fileParallelism: false`) against one shared container; each test calls `resetDb()` (`test/integration/helpers.js`) which TRUNCATEs + re-seeds for isolation. The DB comes from `TEST_DATABASE_URL` if set (CI service container), otherwise Testcontainers spins up `postgres:16-alpine` (`global-setup.js`). `helpers.js` imports all `src` modules **dynamically** so `DATABASE_URL` is set before `config.ts`/`pool.ts` first load — preserve that pattern.

**Unified response envelope.** Every endpoint returns `{ data: ... }` or `{ error: { code, message } }` via `ok()` / `fail()` in `src/lib/errors.ts`. Throw `AppError(code, message)` from anywhere; `ErrorCodes` maps the code to an HTTP status and the `errorHandler` middleware formats it. Wrap all async route handlers in `asyncHandler(...)` so rejections reach the error handler.

**Auth & RBAC.** `middleware/auth.ts`: `authenticate` verifies the Bearer access token and re-checks the user is active in the DB on every request; `authorize('admin', 'shipper')` guards by role. Routes compose them: `authenticate, authorize(...), asyncHandler(...)`. Frontend (`src/api/client.js`) stores tokens in localStorage and auto-refreshes once on 401.

**Shippers never see money — enforced server-side.** Order responses for shippers go through `toShippingView()` in `orders.routes.ts` which strips `total_amount`/`unit_price`. Real-time events are role-split too: `emitOrderCreated` in `lib/realtime.ts` sends the full (with-amount) payload to `role:admin` and the stripped payload to `role:shipper`. When adding any order-facing data path, apply the same split — do not rely on the frontend to hide amounts.

**Real-time (Socket.IO).** `lib/realtime.ts` holds a module-level `io`. Clients authenticate via JWT in the socket handshake and auto-join `role:<role>` and `user:<id>` rooms. Emit through the `emit*` helpers (they no-op if `io` isn't initialized). Events: `order.created`, `order.status_changed`, `inventory.updated`. Emit **after** the DB transaction commits, not inside it (see the order-creation flow).

**Order creation is transactional.** `POST /orders` runs inside `withTransaction()` (`db/pool.ts`): it `SELECT ... FOR UPDATE` locks product rows to prevent overselling, validates listed/stock, decrements stock, writes `order_items` and a `shipment_status_logs` row, then emits events outside the transaction. Order status only moves forward `pending → preparing → shipped` (the `NEXT_STATUS` map); any other transition throws `INVALID_STATUS_TRANSITION`.

**Time zone.** "Today" is always Asia/Taipei. Never compute day boundaries or order-number date prefixes with raw `Date` — use the helpers in `lib/tz.ts` (`taipeiDayRange`, `taipeiOrderDatePrefix`, `taipeiToday`). Order numbers are `YYYYMMDD-NNN` per Taipei day.

**DB access.** Single `pg.Pool` in `db/pool.ts`. `numeric` columns are parsed to JS `number` (type parser registered there) so prices arrive as numbers, not strings. Use `pool.query<RowType>(...)` with row types from `src/types.ts` (DB rows are `type` aliases, not `interface`, deliberately — see the comment in `types.ts` re: `QueryResultRow`). Schema lives in `migrations/*.sql` (node-pg-migrate, each file split by `-- Up Migration` / `-- Down Migration`); change the schema by adding a migration, not by editing an old one.

**Frontend PWA.** `vite.config.js` uses `vite-plugin-pwa` with `injectManifest` and a custom service worker at `src/sw.js` (offline + Web Push). In production, nginx (`frontend/nginx.conf`) serves the SPA and reverse-proxies `/api`, `/uploads`, `/socket.io` to the backend. Web Push is optional and needs VAPID keys (`npx web-push generate-vapid-keys` → root `.env`); without them push is a silent no-op.

## Conventions

- Commit messages and code comments in this repo are in Traditional Chinese; match the surrounding style.
- This is a learning repo — split commits by feature, not by layer (see auto-memory).

# 01 · Node.js 的資料庫 Migration

## 問題：JS 有 migration 套件嗎？

有，而且不少。本專案用的是 **node-pg-migrate**（見 `backend/src/db/migrate.js` 第 1 行 `import migrationRunner from 'node-pg-migrate'`）。

## 常見選擇

| 類型 | 套件 | 特色 |
|------|------|------|
| 通用 / 多資料庫 | **Knex.js** | query builder 內建 migration + seed，老牌 |
| migration framework | **Umzug** | Sequelize 底層用的就是它 |
| ORM 內建 | **Prisma** | 靠 schema diff 自動產生 migration，現在很紅 |
| ORM 內建 | **TypeORM** / **Sequelize** | `migration:generate/run` |
| TS 取向 | **Drizzle** (`drizzle-kit`) | 輕量 |
| 專一 PostgreSQL | **node-pg-migrate** ← 本專案 | 用 JS/SQL 寫 up/down，不綁 ORM |

## 為什麼這專案選 node-pg-migrate

1. **沒用 ORM** — `backend/src/db/pool.js` 直接用 `pg` 跑原生 SQL，node-pg-migrate 同路線、不強迫套整個 ORM。
2. **migration 可用 SQL 寫**（`npm run migrate:create -- xxx` 產生 `-- Up / -- Down` 的 SQL 檔），可控、好讀。
3. 自己管一張 `pgmigrations` 表記錄跑過哪些版本 —— 這是所有 migration 工具的共通機制。

## 常用指令（見 backend/package.json）

```bash
npm run migrate:create -- add_xxx   # 產生新遷移檔
npm run migrate:up                  # 套用所有未執行的遷移
npm run migrate:down                # 回滾一步
```

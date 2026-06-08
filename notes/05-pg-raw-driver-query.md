# 05 · pg 是 raw driver：參數化查詢、rows 陣列、TS 取值

## 重點

這個專案用 [`pg`](https://node-postgres.com/)（node-postgres），它是**低階 driver，不是 ORM**。
沒有 Prisma / TypeORM 那種 `findFirst()`、`save()`、model mapping —— SQL 是手寫的，回來的就是資料列陣列。

```ts
const { rows } = await pool.query<UserRow>(
  'SELECT * FROM users WHERE username = $1',   // 手寫 raw SQL
  [username]                                    // 參數陣列，對應 $1
);
const user = rows[0];        // 要自己取第一筆
if (!user) throw new AppError('NOT_FOUND');
```

## 為什麼「像 raw 又防得了 injection」：`$n` 參數化查詢

`$1` 是**佔位符**，不是字串拼接。driver 把「SQL 語句」和「參數值」分兩條路送到 PostgreSQL：
語句先送去 parse / plan，值之後才綁定。資料庫永遠把參數**當成一個值**，不會當成 SQL 執行。

```ts
// ✅ 安全：就算 username = "' OR 1=1 --" 也只是一個字面字串
pool.query('SELECT * FROM users WHERE username = $1', [username]);

// ❌ 危險：字串拼接 = SQL injection 漏洞
pool.query(`SELECT * FROM users WHERE username = '${username}'`);
```

規則只有一條：**值一律走 `$n` + 參數陣列，永遠不要把使用者輸入拼進 SQL 字串**。
`LIKE` 也一樣，把 `` `${prefix}-%` `` 當成參數值傳進去（見 orders.routes.ts 的 `order_no LIKE $1`）。

## 回傳一定是陣列，沒有 query-one

`pool.query(...)` 永遠回一個 result 物件，資料列都在 `result.rows`（陣列），不管查到幾筆：

| 查到 | `rows` |
|------|--------|
| 0 筆 | `[]`（空陣列，**不是** null） |
| 1 筆 | `[那一筆]` → 自己取 `rows[0]` |
| N 筆 | `[...]` |

慣用寫法兩種：

```ts
const { rows } = await pool.query<UserRow>(...);
const user = rows[0];                 // 可能 undefined，要檢查

const { rows: [order] } = await pool.query<OrderRow>(...);   // 解構直接取
```

> 想「只要一筆」最好在 SQL 加 `LIMIT 1`；`rows[0]` 只是丟掉多餘列，資料其實還是全撈了。

## `query<UserRow>` 只是型別標註

`<UserRow>` 是 **TypeScript 編譯期**的型別，讓 `rows` 變成 `UserRow[]`、有自動完成。
它**不影響執行時**，pg 不會驗證回來的欄位真的符合 `UserRow`（不是 ORM 的 mapping）。

## 陷阱：空陣列取 `[0]` 不會噴錯，但後面用它會

JS 取不存在的 index **回 `undefined`，不丟例外**（跟 Java `ArrayIndexOutOfBoundsException`、Python `IndexError` 不同）：

```js
const rows = [];
rows[0];            // undefined（不 throw）
rows[0].username;   // ❌ TypeError: Cannot read properties of undefined
```

會 throw 的不是取 `[0]`，是**對 `undefined` 取屬性**。所以一定要 `if (!user)` 先擋。

這個專案 `tsconfig.json` 設 `noUncheckedIndexedAccess: false`，所以 TS **不會**提醒 `rows[0]` 可能是 undefined（型別仍是 `UserRow`）—— 靠人工檢查。若開成 `true`，`rows[0]` 型別會變 `UserRow | undefined`，TS 在編譯期就強迫你處理，等於把「執行時爆掉」提前成「編譯期紅線」。

## 跟 ORM 對照

| | 這個專案（pg） | ORM（Prisma/TypeORM） |
|---|---|---|
| SQL | 手寫 raw | 自動產生 |
| 防 injection | `$n` 參數化（driver 保證） | 自動參數化 |
| 取一筆 | `rows[0]` 自己取＋判斷 | `findFirst()` / `findUnique()` |
| 型別 | `query<T>` 只是標註 | 真實 model mapping |
| 找不到 | `undefined` | `null`（或 throw，依方法） |

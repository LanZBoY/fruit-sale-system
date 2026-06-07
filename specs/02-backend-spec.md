# 後端規格 (Backend Spec)

> 配合 `00-overview.md` 與 `01-frontend-spec.md` 閱讀。

## 1. 技術選型建議

| 項目 | 建議 | 說明 |
|------|------|------|
| 語言/框架 | Node.js + NestJS 或 Express（亦可 Python FastAPI） | 團隊熟悉即可 |
| 資料庫 | PostgreSQL | 交易一致性、統計查詢方便 |
| 即時推送 | WebSocket（Socket.IO）或 SSE | 出貨組即時接單 |
| 推播通知 | Web Push (VAPID) | PWA 背景通知 |
| 檔案儲存 | 物件儲存 (S3 相容) 或本機 + 靜態服務 | 商品圖片 |
| 認證 | JWT (Access + Refresh) | 角色權限 |

> 規模小（3～10 人），單一服務 + 單一 DB 即可，不需微服務。

## 2. 資料模型

### 2.1 User 使用者
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID | PK |
| username | string | 登入帳號，唯一 |
| password_hash | string | bcrypt/argon2 |
| display_name | string | 顯示名稱 |
| role | enum | `sales` / `shipper` / `admin` |
| is_active | boolean | 是否啟用 |
| created_at | timestamp | |

### 2.2 Customer 客戶
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID | PK |
| name | string | 客戶姓名 |
| phone | string | 客戶電話 |
| created_at | timestamp | |

> 訂單可重用既有客戶，亦可建單時即時新增。phone 建議建索引以便查詢。

### 2.3 Product 商品
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID | PK |
| name | string | 商品名稱（例：澳洲紅地球） |
| image_url | string | 商品圖片 URL |
| stock_qty | integer | 庫存數量 |
| is_listed | boolean | 是否上架 |
| created_at | timestamp | |
| updated_at | timestamp | |

### 2.4 Order 訂單
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID | PK |
| order_no | string | 訂單編號，唯一（顯示用） |
| customer_id | UUID | FK → Customer |
| customer_name | string | 下單當下快照 |
| customer_phone | string | 下單當下快照 |
| total_amount | decimal | 訂單總金額 |
| status | enum | `pending` / `preparing` / `shipped` |
| created_by | UUID | FK → User（銷售人員） |
| created_at | timestamp | 訂單時間 |
| shipped_at | timestamp \| null | 出貨完成時間 |

> 客戶姓名/電話建議快照存入訂單，避免客戶資料異動影響歷史。

### 2.5 OrderItem 訂單明細
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID | PK |
| order_id | UUID | FK → Order |
| product_id | UUID | FK → Product |
| product_name | string | 商品名稱快照 |
| qty | integer | 數量 |
| unit_price | decimal | 單價（金額）|
| subtotal | decimal | qty × unit_price |

### 2.6 ShipmentStatusLog 出貨狀態紀錄
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | UUID | PK |
| order_id | UUID | FK → Order |
| from_status | enum \| null | 變更前狀態 |
| to_status | enum | 變更後狀態 |
| changed_by | UUID | FK → User |
| changed_at | timestamp | |

## 3. 權限矩陣 (RBAC)

| 功能 / 端點 | sales | shipper | admin |
|------------|:-----:|:-------:|:-----:|
| 登入 | ✅ | ✅ | ✅ |
| 查商品/庫存 | ✅ | 名稱+數量* | ✅ |
| 查商品金額 | ✅ | ❌ | ✅ |
| 建立訂單 | ✅ | ❌ | ✅ |
| 查待出貨訂單（不含金額） | ❌ | ✅ | ✅ |
| 更新出貨狀態 | ❌ | ✅ | ✅ |
| 查訂單金額/營收統計 | 自己訂單 | ❌ | ✅ |
| 商品管理（CRUD/上架/庫存）| ❌ | ❌ | ✅ |
| 客戶資料管理 | 建立 | ❌ | ✅ |
| 使用者管理 | ❌ | ❌ | ✅ |

> *出貨組看到的訂單/商品資料一律**過濾掉金額欄位**（後端層級移除，非僅前端隱藏）。

## 4. API 規格

統一前綴 `/api/v1`。所有需授權端點帶 `Authorization: Bearer <token>`。
回應統一格式：

```json
// 成功
{ "data": { ... } }
// 錯誤
{ "error": { "code": "STRING_CODE", "message": "可讀訊息" } }
```

### 4.1 認證 Auth
| 方法 | 路徑 | 角色 | 說明 |
|------|------|------|------|
| POST | `/auth/login` | all | 帳密登入，回傳 access/refresh token + role |
| POST | `/auth/refresh` | all | 換發 access token |
| POST | `/auth/logout` | all | 註銷 refresh token |
| GET | `/auth/me` | all | 取得目前使用者資訊 |

**POST /auth/login**
```json
// req
{ "username": "alice", "password": "..." }
// res
{ "data": { "access_token": "...", "refresh_token": "...",
  "user": { "id": "...", "display_name": "Alice", "role": "sales" } } }
```

### 4.2 商品 Products
| 方法 | 路徑 | 角色 | 說明 |
|------|------|------|------|
| GET | `/products` | sales, admin | 商品列表（含金額/庫存）|
| GET | `/products?for=shipping` | shipper | 商品列表（名稱+庫存，無金額）|
| GET | `/products/:id` | sales, admin | 單一商品 |
| POST | `/products` | admin | 新增商品 |
| PUT | `/products/:id` | admin | 編輯商品（名稱/圖片/庫存/上架）|
| PATCH | `/products/:id/listing` | admin | 切換上架狀態 |
| POST | `/products/:id/image` | admin | 上傳商品圖片（multipart）|

查詢參數：`?listed=true`（僅上架）、`?q=關鍵字`。

### 4.3 客戶 Customers
| 方法 | 路徑 | 角色 | 說明 |
|------|------|------|------|
| GET | `/customers?q=` | sales, admin | 搜尋客戶（姓名/電話）|
| POST | `/customers` | sales, admin | 建立客戶 |
| GET | `/customers/:id` | admin | 客戶詳情 |

### 4.4 訂單 Orders
| 方法 | 路徑 | 角色 | 說明 |
|------|------|------|------|
| POST | `/orders` | sales | 建立訂單（觸發即時通知 + 扣庫存）|
| GET | `/orders` | admin | 訂單紀錄（可日期/狀態篩選）|
| GET | `/orders/mine` | sales | 自己建立的訂單 |
| GET | `/orders/shipping` | shipper | 待出貨/備貨中清單（**無金額**）|
| GET | `/orders/:id` | admin, (sales自己) | 訂單詳情 |
| PATCH | `/orders/:id/status` | shipper, admin | 更新出貨狀態 |

**POST /orders**
```json
// req
{
  "customer": { "id": "uuid-或-null", "name": "王小明", "phone": "0912345678" },
  "items": [
    { "product_id": "uuid", "qty": 3, "unit_price": 250 },
    { "product_id": "uuid", "qty": 1, "unit_price": 500 }
  ]
}
// res
{ "data": { "id": "...", "order_no": "20260602-001", "status": "pending",
  "total_amount": 1250, "created_at": "..." } }
```
行為：
1. 驗證商品上架且庫存足夠（不足回 `INSUFFICIENT_STOCK`）
2. 交易內：建立 Order + OrderItem、扣減 `stock_qty`、寫 status log
3. 透過即時通道推送新訂單給 shipper（payload 不含金額）

**PATCH /orders/:id/status**
```json
// req
{ "status": "preparing" }   // pending → preparing → shipped
```
- 僅允許單向推進（pending→preparing→shipped），逆向或跳階回 `INVALID_STATUS_TRANSITION`
- 寫入 ShipmentStatusLog
- 進入 `shipped` 時設定 `shipped_at = now()`
- 透過即時通道推送狀態更新

### 4.5 出貨清單回傳（shipper，無金額）
```json
{ "data": [
  { "id": "...", "order_no": "20260602-001", "status": "pending",
    "customer_name": "王小明", "customer_phone": "0912345678",
    "created_at": "2026-06-02T10:30:00+08:00",
    "items": [ { "product_name": "愛文芒果", "qty": 3 } ] }
] }
```

### 4.6 統計 Stats（admin）
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/stats/summary?date=YYYY-MM-DD` | 當日營收、訂單數 |
| GET | `/stats/product-ranking?from=&to=` | 商品銷售排行 |
| GET | `/stats/orders?from=&to=&status=` | 訂單紀錄查詢 |

**GET /stats/summary**
```json
{ "data": { "date": "2026-06-02", "revenue": 35200, "order_count": 18,
  "shipped_count": 12, "pending_count": 6 } }
```

**GET /stats/product-ranking**
```json
{ "data": [
  { "product_id": "...", "product_name": "愛文芒果", "qty": 120, "amount": 30000 },
  { "product_id": "...", "product_name": "玉荷包", "qty": 80, "amount": 16000 }
] }
```

### 4.7 使用者管理 Users（admin）
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/users` | 列表 |
| POST | `/users` | 建立（指定角色）|
| PUT | `/users/:id` | 編輯 |
| PATCH | `/users/:id/active` | 啟用/停用 |

## 5. 即時通訊 (Realtime)

採 WebSocket（Socket.IO）或 SSE，連線時驗證 JWT。

### 房間 / 頻道
- `role:shipper` — 推送新訂單與狀態變更
- `role:admin` — 推送新訂單、狀態變更、統計變動

### 事件
| 事件 | 方向 | Payload | 對象 |
|------|------|---------|------|
| `order.created` | server→client | 出貨用訂單物件（無金額）| shipper, admin |
| `order.status_changed` | server→client | `{ order_id, order_no, status, changed_at }` | shipper, admin |
| `inventory.updated` | server→client | `{ product_id, stock_qty }` | sales, admin |

> 給 admin 的 `order.created` 可含金額；給 shipper 的不含金額（後端依房間角色組裝不同 payload）。

### 推播通知（背景）
- 訂單建立時，對 shipper 角色已訂閱裝置發送 Web Push（VAPID）
- 端點：`POST /push/subscribe`、`DELETE /push/subscribe`

## 6. 庫存規則
- 建單成功即扣庫存（同一 DB 交易，避免超賣）
- 庫存可能為負時拒絕下單（回 `INSUFFICIENT_STOCK`）
- admin 可手動調整庫存（PUT /products/:id）
- （選配）訂單取消時回補庫存 — 目前需求未提取消，列為未來擴充

## 7. 非功能性需求
- **安全**：HTTPS、密碼雜湊 (argon2/bcrypt)、JWT 短效期 + refresh、出貨組金額在後端過濾
- **時區**：一律以 `Asia/Taipei` 計算「今日」統計
- **稽核**：訂單狀態變更全程留痕 (ShipmentStatusLog)
- **效能**：小規模，單機足夠；統計查詢加日期索引
- **可用性**：DB 每日備份
- **錯誤碼**：`UNAUTHORIZED` / `FORBIDDEN` / `VALIDATION_ERROR` / `INSUFFICIENT_STOCK` / `INVALID_STATUS_TRANSITION` / `NOT_FOUND`

## 8. 索引建議
- `orders(created_at)`、`orders(status)`、`orders(created_by)`
- `order_items(order_id)`、`order_items(product_id)`
- `customers(phone)`
- `products(is_listed)`

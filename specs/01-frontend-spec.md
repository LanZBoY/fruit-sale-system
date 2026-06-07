# 前端規格 (Frontend Spec)

> 配合 `00-overview.md` 與 `02-backend-spec.md` 閱讀。

## 1. 技術選型建議

| 項目 | 建議 | 說明 |
|------|------|------|
| 框架 | React 或 Vue（擇一） | 元件化、生態成熟 |
| PWA | Vite PWA plugin / Workbox | Service Worker、可安裝、推播 |
| UI | Tailwind CSS + 元件庫 | 手機優先 RWD |
| 狀態管理 | React Query / Pinia | 伺服器狀態快取 |
| 即時 | Socket.IO client 或 EventSource | 接收 order.created 等事件 |
| 路由守衛 | 依角色導向不同首頁 | sales / shipper / admin |

PWA 需求：
- 支援 Android / iPhone / 桌面瀏覽器
- 可加入主畫面 (manifest + icons)
- Service Worker 快取殼層 (app shell)
- Web Push 推播訂閱（出貨組）

## 2. 三個角色介面

登入後依 `role` 導向對應介面：

- `sales` → 銷售組（手機）
- `shipper` → 出貨組（手機）
- `admin` → 管理後台（電腦）

### 共用：登入頁 `/login`
- 帳號、密碼輸入
- 登入成功存 token，依角色導頁
- 錯誤提示（帳密錯誤、帳號停用）

---

## 3. 銷售組介面（手機）

### 3.1 建立訂單頁 `/sales/new-order`（首頁）
版面（手機直式單欄）：
1. **客戶資料**
   - 客戶姓名（輸入）
   - 客戶電話（輸入，數字鍵盤）
   - 可搜尋既有客戶（輸入電話/姓名帶出）
2. **商品選擇**
   - 商品清單（卡片：圖片 + 名稱 + 庫存 + 金額）
   - 僅顯示上架商品
   - 點選加入，輸入數量
   - 輸入銷售金額（單價，預設帶商品定價可改）
3. **訂單明細小計**
   - 即時顯示各項小計與總金額
4. **送出訂單**按鈕
   - 送出成功 → Toast「已送出，已通知出貨組」→ 清空表單
   - 庫存不足 → 錯誤提示

呼叫：`POST /orders`

### 3.2 商品庫存頁 `/sales/products`
- 商品清單（圖片、名稱、剩餘庫存、金額）
- 透過 `inventory.updated` 事件即時更新庫存數字
- 唯讀（不可編輯）

呼叫：`GET /products?listed=true`

### 3.3 我的訂單 `/sales/orders`（選配）
- 自己建立的訂單與目前出貨狀態

呼叫：`GET /orders/mine`

---

## 4. 出貨組介面（手機）

> **任何畫面皆不顯示金額。**

### 4.1 待出貨清單 `/shipper`（首頁）
- 分頁/分區：待出貨 / 備貨中 / 已出貨
- 每張訂單卡片顯示：
  - 客戶姓名
  - 客戶電話（可點擊撥號）
  - 商品名稱 + 數量（逐項列出）
  - 訂單時間
  - 目前狀態
- **即時**：收到 `order.created` 事件時，新訂單浮現於頂部 + 音效/震動 + 紅點
- 背景推播：App 未開啟時 Web Push 通知

呼叫：`GET /orders/shipping`、訂閱 socket `order.created` / `order.status_changed`

### 4.2 訂單狀態操作
- 卡片上提供狀態推進按鈕：
  - 待出貨 → 「開始備貨」（preparing）
  - 備貨中 → 「完成出貨」（shipped）
- 點擊後呼叫 `PATCH /orders/:id/status`
- 成功後卡片移至對應分區，已出貨自動記錄時間並顯示

### 4.3 出貨組看到的資料（範例）
```
┌──────────────────────────────┐
│ 訂單 20260602-001   10:30     │
│ 客戶：王小明  📞 0912345678    │
│ ─────────────────────────     │
│ 愛文芒果 × 3                   │
│ 玉荷包   × 1                   │
│ ─────────────────────────     │
│ 狀態：待出貨   [開始備貨]      │
└──────────────────────────────┘
```
（無任何金額欄位）

---

## 5. 管理後台（電腦）

電腦版寬螢幕版面，左側選單 + 主內容區。

### 5.1 儀表板 `/admin`（首頁）
- 卡片：今日營收、今日訂單數、待出貨數、已出貨數
- 日期選擇器（預設今日，可查歷史）
- 商品銷售排行（長條圖 / 表格）

呼叫：`GET /stats/summary?date=`、`GET /stats/product-ranking?from=&to=`

### 5.2 訂單紀錄 `/admin/orders`
- 表格：訂單編號、客戶、商品摘要、金額、狀態、時間
- 篩選：日期區間、狀態
- 點擊看訂單詳情（含明細、狀態變更歷程）

呼叫：`GET /stats/orders` 或 `GET /orders`

### 5.3 商品管理 `/admin/products`
- 商品列表（圖片、名稱、庫存、上架狀態）
- 新增 / 編輯商品：名稱、圖片上傳、庫存數量、是否上架
- 切換上架開關

呼叫：`GET/POST/PUT /products`、`PATCH /products/:id/listing`、`POST /products/:id/image`

### 5.4 客戶資料 `/admin/customers`
- 客戶列表與搜尋（姓名 / 電話）
- 客戶歷史訂單

呼叫：`GET /customers`

### 5.5 出貨狀態總覽 `/admin/shipments`
- 所有訂單目前出貨狀態（即時更新）

### 5.6 使用者管理 `/admin/users`
- 建立/編輯使用者、指定角色、啟用停用

呼叫：`GET/POST/PUT /users`

---

## 6. 即時與離線

### 即時
- 登入後建立 WebSocket/SSE 連線，帶 JWT
- 訂閱事件並更新 UI：
  - `order.created`（shipper/admin）
  - `order.status_changed`（shipper/admin）
  - `inventory.updated`（sales/admin）
- 斷線自動重連，重連後重新拉取清單補齊

### PWA / 離線
- App shell 快取，弱網仍可開啟介面
- 送出訂單需連線；離線時提示「無網路，稍後再試」（可選：佇列重送）
- 出貨組推播：訂閱 Web Push，背景接收新訂單通知

## 7. 權限與資料隔離（前端層）
- 路由守衛：未登入導 `/login`；角色不符導回自身首頁
- 出貨組前端**不請求亦不渲染**任何金額欄位（後端也會過濾，雙保險）
- token 過期自動 refresh，失敗則登出

## 8. RWD / 可用性
- 銷售組、出貨組：手機優先，大按鈕、易點擊、數字鍵盤
- 管理後台：桌面優先，表格與圖表
- 電話號碼 `tel:` 連結可直接撥號
- 操作回饋：送出/狀態變更皆有 Toast 與 loading 狀態

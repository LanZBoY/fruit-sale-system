# 📋 Backlog（未來要做的功能）

記錄規劃中、尚未實作的功能與想法。完成後移到「已完成」或刪除。

---

## 🚧 規劃中

### 1. 訂單自動派單給出貨組

**目標**：銷售組建立訂單後，系統自動把訂單分配給「目前閒置且今天有上班」的出貨組人員，取代現在「所有出貨組共看同一張待出貨清單」的模式。

**規則**：
- 只有**今天有上班（打卡 / 排班）**的出貨組人員，才會被列入派單候選。
- 從候選人中挑「**正在閒置**」的人（例如手上沒有 `preparing` 中的訂單，或負載最低者）。
- 訂單建立時即指派 `assigned_to`，並透過即時事件只通知到被指派的人。

**待釐清 / 設計問題**：
- 「今天有上班」怎麼定義？需要新增**排班 / 打卡（attendance / shift）**機制 — 簡單版可做一個「上班 / 下班」開關（類似 on-shift 狀態），複雜版做排班表。
- 「閒置」怎麼判定？建議：手上 `preparing` 訂單數為 0；或取負載最小者（round-robin / least-load）。
- 沒有任何符合條件的人時怎麼辦？退回「未指派」共用清單，或卡住等人上班。
- 訂單被指派後可否轉派 / 退回？（出貨組臨時離開）

**預計影響範圍**：
- DB：`orders` 加 `assigned_to`（FK → users）；新增 `shifts` 或 `attendance` 表，或 `users.on_shift` 欄位 → **新增 migration**。
- 後端：派單演算法（建立訂單時計算指派）；`/orders/shipping` 改成只回自己被指派的；上班 / 下班的 API。
- 即時：`order.created` 改為定向通知被指派者（目前是廣播給所有 shipper）。
- 前端：出貨組加「上班 / 下班」切換；待出貨清單改看「指派給我的」。

---

### 2. 全專案改寫為 TypeScript（學習目的）

**目標**：把前後端從 JavaScript 改寫成 TypeScript，主要為了學 TS。

**建議做法（漸進式，不要一次全砍掉重寫）**：
- **後端**先做（型別收益最大、檔案較少）：
  - 加 `tsconfig.json`、`typescript` + `@types/node` `@types/express` 等。
  - 先把 `.js` 改副檔名成 `.ts`，開 `allowJs` + `checkJs` 逐步補型別，最後關掉 allowJs。
  - DB 查詢結果、API 的 request/response 定義 `interface` / `type`（型別收益最明顯的地方）。
  - 執行：用 `tsx`（開發）或 `tsc` 編譯；Dockerfile 加 build 階段。
- **前端**：Vite 原生支援 TS，元件改 `.tsx`，props 定義型別；React Query / Socket.IO 事件 payload 都可上型別。
- 可考慮共用一份型別（monorepo 的 `shared/` 放 API DTO，前後端共用）。

**學習重點**：`interface` vs `type`、泛型、`unknown` vs `any`、`strict` 模式、第三方套件的 `@types/*`、Express 的型別擴充（`Request` 加自訂欄位如 `req.user`）。

---

### 3. 加入 Swagger / OpenAPI API 文件

> ⏳ **順序：先做完 #2 TypeScript 改寫，再引入。**

**現況**：目前沒有任何 swagger/openapi。API 文件只有純文字（`README.md` 的「API 摘要」段、`specs/02-backend-spec.md`），不是機器可讀，無法產互動式 UI、client SDK 或 contract test。

**目標**：提供機器可讀的 OpenAPI 文件 + 可互動的 Swagger UI（例如掛在 `/api-docs`）。

**做法（兩種主流，擇一）**：
- **註解驅動**：`swagger-jsdoc` + `swagger-ui-express`，在 route 上方寫 JSDoc 註解掃描產出。可漸進貼著現有 route 加。
- **Spec 優先**：手寫 `openapi.yaml` + `swagger-ui-express`，先定 contract 再對照實作。

**為何排在 TS 之後（綜效）**：改成 TS 後可用 **`zod` + `zod-to-openapi`**（或 `tsoa`）**從型別/驗證 schema 自動產生 OpenAPI**，文件不會跟程式碼脫節 —— 這是現在 TS 後端很流行的做法，比手寫註解更不易過時。

**學習重點**：OpenAPI 3 規格結構、request/response schema、用 zod 同時做「執行期驗證」與「文件來源（single source of truth）」。

---

## ✅ 已完成

（尚無）

# 📋 Backlog（未來要做的功能）

記錄規劃中、尚未實作的功能與想法。完成後移到「已完成」或刪除。

---

## 🚧 規劃中

### 1. 前端改寫為 TypeScript（學習目的）

> 後端已完成（見「已完成」）；此項為剩下的前端部分。

**目標**：把前端 React 從 JavaScript 改寫成 TypeScript。

**建議做法**：
- Vite 原生支援 TS，元件 `.jsx → .tsx`，props 用 `interface`/`type` 定義。
- React Query 的 query/mutation、Socket.IO 事件 payload 都可上型別。
- 可考慮抽一份共用型別（monorepo `shared/` 放 API DTO，前後端共用；後端的 `src/types.ts` 可當基礎）。

**學習重點**：`.tsx` 與 JSX 型別、元件 props/state 型別、event handler 型別、`React.FC` 的取捨。

---

### 2. 訂單自動派單給出貨組

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

### 3. 加入 Swagger / OpenAPI API 文件

> ⏳ **順序：先做完 #1 TypeScript 改寫，再引入。**

**現況**：目前沒有任何 swagger/openapi。API 文件只有純文字（`README.md` 的「API 摘要」段、`specs/02-backend-spec.md`），不是機器可讀，無法產互動式 UI、client SDK 或 contract test。

**目標**：提供機器可讀的 OpenAPI 文件 + 可互動的 Swagger UI（例如掛在 `/api-docs`）。

**做法（兩種主流，擇一）**：
- **註解驅動**：`swagger-jsdoc` + `swagger-ui-express`，在 route 上方寫 JSDoc 註解掃描產出。可漸進貼著現有 route 加。
- **Spec 優先**：手寫 `openapi.yaml` + `swagger-ui-express`，先定 contract 再對照實作。

**為何排在 TS 之後（綜效）**：改成 TS 後可用 **`zod` + `zod-to-openapi`**（或 `tsoa`）**從型別/驗證 schema 自動產生 OpenAPI**，文件不會跟程式碼脫節 —— 這是現在 TS 後端很流行的做法，比手寫註解更不易過時。

**學習重點**：OpenAPI 3 規格結構、request/response schema、用 zod 同時做「執行期驗證」與「文件來源（single source of truth）」。

---

## ✅ 已完成

### 後端改寫為 TypeScript（2026-06-07）

- 全 `backend/src` 由 JS 轉 TypeScript（TS 6，`strict` + `NodeNext`）。
- 共用型別 `src/types.ts`（Role/OrderStatus/各 Row）、`src/express.d.ts` 擴充 `req.user`。
- `pool.query<T>` 泛型化、`asyncHandler`/`errorHandler` 型別化。
- 執行：`tsx`（dev）/ `tsc`（build→`dist`）；Dockerfile 改多階段；CI 加 `typecheck`。
- 全程以 126 條測試當安全網，行為不變、tsc 0 錯。

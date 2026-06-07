# 04 · Express 的 async 錯誤處理、next 機制與洋蔥模型

從 `backend/src/lib/errors.js` 的 `asyncHandler` 一路延伸出來的觀念整理。

---

## 1. asyncHandler 在解什麼問題

```js
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```

**問題**：Express 4 只會自動接住「同步」throw 的錯誤。async handler 丟錯時是回傳一個 rejected Promise，而 Express **不會 await 你的 handler**，所以那個 rejection 沒人接 → `UnhandledPromiseRejection`，client 端請求**永遠 hang**。

**解法**：`asyncHandler` 把 handler 包一層，`.catch(next)` 自動把 rejection 轉成 `next(err)` 交給錯誤 middleware，省掉每個 route 寫 try/catch。

### 兩層 wrapper（currying / 高階函式）= 兩個時間點

```js
function asyncHandler(fn) {            // 外層：定義路由時跑一次，用閉包「記住」fn
  return function (req, res, next) {   // 內層：每次請求時由 Express 呼叫
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

- **外層 `(fn) =>`**：在 `router.get('/x', asyncHandler(myFn))` 註冊路由那一刻執行，只負責「打包」，回傳內層那個標準簽名 handler。此時還沒有 req/res。
- **內層 `(req,res,next) =>`**：每次請求進來時 Express 才呼叫，由 Express 把 `req/res/next` 塞進來，再轉交給 `fn`，並用 `.catch(next)` 接錯誤。
- `Promise.resolve(...)` 是為了把「fn 可能 async（回 Promise）也可能不是（回 undefined）」統一成 Promise，才能安全 `.catch`。
- 成功時 `.catch` 不觸發 → **asyncHandler 不會自動往下走**，handler 自己 `res.json` 結束。

---

## 2. next 的兩種模式：差在「帶不帶參數」

```js
router.get('/x', funcA, funcB, errorHandler);
```

| 呼叫 | 行為 |
|------|------|
| `next()` 不帶參數 | 走到**下一個一般 handler**（funcA → funcB） |
| `next(err)` 帶一個參數 | **跳過所有後續一般 handler**，直奔**錯誤處理 middleware**（4 參數簽名 `(err,req,res,next)`） |

`.catch(next)` 等於 `.catch(err => next(err))` —— 一定帶 err，所以走第二種：跳到 `errorHandler`，不是 funcB。

> 特例：`next('route')`（字串）跳過這條 route 剩下的 handler，去比對下一條 route。本專案沒用到。

---

## 3. Express 內部：list + index 迭代（跟 Gin 很像）

Router 內維護一個 `stack` 陣列，每個元素是 `Layer`（包住一個 handler + 路徑比對規則）。`next` 是一個閉住索引 `idx` 的閉包（簡化）：

```js
function next(err) {
  const layer = stack[idx++];                    // 取下一個、索引前進
  if (!layer) return done(err);                  // 走完
  if (!layer.match(req.path)) return next(err);  // 路徑不合，跳過
  if (err) layer.handleError(err, req, res, next);   // 帶 err → 只找 4 參數 error layer
  else     layer.handleRequest(req, res, next);      // 呼叫 fn(req,res,next)
}
```

所以 `next()` = 「把 idx 往前推一格、呼叫下一個 layer」。

---

## 4. 洋蔥模型：Gin / Koa 是真洋蔥，Express 4 只有「同步」時成立

「next 時呼叫下一個，next 之後反向回來做後處理」這個洋蔥概念：

| | 資料結構 | next 機制 | 反向後處理（洋蔥） |
|---|---|---|---|
| **Express 4** | Layer stack + idx 閉包 | 同步 callback，**不 await** | 只有同步成立；async 破功 → 才需要 asyncHandler |
| **Gin** | `handlers` slice + `c.index` | `c.Next()` 同步 loop 跑完下游 | ✅ 真洋蔥 |
| **Koa** | middleware 陣列 | `await next()` | ✅ 真洋蔥（async 也成立） |

Express 對 **async** middleware：`next()` 觸發下游後，下游一遇到 `await` 就把控制權交回來，於是 `next()` 後面的「後處理」**搶在下游完成前**就跑了 → 洋蔥破功。這也是 async rejection 流不回 next 鏈、需要 `asyncHandler` 手動 `.catch(next)` 補回來的原因。

---

## 5. 為什麼不能 `await next()`？關鍵不是「同步」，是「回傳值不是 Promise」

`await` 等的是**回傳值是不是 Promise**，跟函式宣告成 async 或同步**無關**：

```js
function foo() { return fetch('/x'); }  // 同步函式，但回傳 Promise
await foo();   // ✅ 真的會等 fetch
```

Express 的 `next` 內部呼叫下游後**沒有 return 下游的 Promise**，回傳 `undefined`：

```js
function next(err) {
  const layer = stack[idx++];
  layer.handleRequest(req, res, next);  // 呼叫下游，但不 return 結果
  // → next() 回傳 undefined
}
```

所以 `await next()` = `await undefined` = **不等任何東西**（合法，但沒用）。
就算把 next 改寫成 `async function`，只要它沒把下游那條 Promise 交回來，一樣 await 不到。

Koa 能 `await next()`，是因為它的 next 被刻意設計成 `return dispatch(i+1)` —— 回傳代表整個下游的 Promise。

### Express 想做「等下游完成的後處理」怎麼辦

不靠 `await next()`，改掛 response 事件：

```js
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => console.log('耗時', Date.now() - start));  // 回應送出後觸發，可靠
  next();
});
```

---

## 重點濃縮

- `asyncHandler` = 用閉包記住 fn（外層，定義時）+ 每次請求接錯誤（內層，`.catch(next)`）。
- `next()` vs `next(err)`：無參往下走、帶參跳錯誤 handler。
- Express 內部就是 Layer stack 用 idx 迭代（像 Gin）。
- 洋蔥模型 Gin/Koa 完整成立；Express 4 只有同步成立，async 要 `.catch(next)` 補。
- `await next()` 沒用不是因為「同步」，是因為 **next 回傳 undefined 不是 Promise**。
- Express 5 會自動接 async 錯誤（asyncHandler 可省），但仍非 Koa 式可 await 的洋蔥。

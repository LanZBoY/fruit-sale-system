# 03 · ESM 如何判斷「被 import」還是「被直接執行」

## 那段程式碼（migrate.js 結尾）

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => process.exit(0))   // 成功 → 結束碼 0
    .catch((e) => {
      console.error(e);
      process.exit(1);             // 失敗 → 結束碼 1
    });
}
```

## 在做什麼

判斷「這個檔案是被**直接執行**，還是被**import**」，只有直接執行時才自動跑 `migrate()`。

| 變數 | 意義 |
|------|------|
| `import.meta.url` | 這個檔自己的 URL，如 `file:///app/src/db/migrate.js` |
| `process.argv[1]` | node 啟動時指定要跑的那個檔，如 `node src/db/migrate.js` 的路徑 |

兩者相等 → 這個檔就是進入點（被直接 `node` 起來）→ 跑 migrate 並 `exit`。

## 兩種情境

- **直接執行**（`node src/db/migrate.js`）：相等 → 自動跑 migrate，跑完 `exit`。給 CLI 手動執行用。
- **被 import**（`server.js` 的 `import { migrate }`）：`argv[1]` 是 server.js，不相等 → 這段不執行，server 自己決定何時 `await migrate()`，不會被誤殺。

## 為什麼需要

讓 `migrate.js` 同時當兩種角色：可被 import 的模組（不能亂 exit）＋ 可獨立跑的腳本（該跑完 exit）。`process.exit` 只放在 `if` 裡，就保證只有當主程式時才結束進程。

## 跟其他語言對照（同概念）

| | 寫法 |
|---|---|
| Python | `if __name__ == "__main__":` |
| Node ESM | `if (import.meta.url === \`file://${process.argv[1]}\`)` |
| Node CommonJS | `if (require.main === module)` |
| Node 21+（新） | `if (import.meta.main)` ← 未來幾乎跟 Python 一樣 |

**重點**：這不是語法強制，是「同檔想兼具兩種身分」時才需要的慣用法。純被 import 的檔（如 `app.js`）就不用寫。

# 📒 學習筆記

這個資料夾放我研究這個專案時整理的學習筆記，重點記錄「為什麼這樣寫」而不只是「寫了什麼」。

## 索引

| 筆記 | 主題 |
|------|------|
| [01-db-migration-in-node.md](01-db-migration-in-node.md) | Node.js 的資料庫 migration 套件生態，為何選 node-pg-migrate |
| [02-app-startup-flow.md](02-app-startup-flow.md) | 後端啟動流程：migration 是在哪裡、怎麼被呼叫的 |
| [03-esm-import-vs-main.md](03-esm-import-vs-main.md) | ESM 如何判斷「被 import」還是「被直接執行」(對比 Python 的 `__main__`) |
| [04-express-async-error-next-onion.md](04-express-async-error-next-onion.md) | asyncHandler、next 機制、洋蔥模型、為何不能 await next |
| [05-pg-raw-driver-query.md](05-pg-raw-driver-query.md) | pg 是 raw driver：`$n` 參數化防注入、rows 陣列取值、TS 空陣列陷阱 |
| [06-argon2-password-hash-phc.md](06-argon2-password-hash-phc.md) | argon2 密碼雜湊：salt 內嵌、PHC 字串格式、為何 verify 不用傳 salt |

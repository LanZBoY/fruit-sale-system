# 06 · argon2 密碼雜湊與 PHC 字串格式

## 那段程式碼（lib/auth.ts）

```ts
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}
export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);   // 不用另外傳 salt，為什麼？
}
```

## 重點

argon2 **不是純 hash**，也不是「取前 N 字元當 salt」。
它每次用**隨機 salt**，並把 salt + 參數 + 演算法一起**內嵌在輸出字串裡**。
所以資料庫只要一個 `password_hash` 欄位，不需要另開 `salt` 欄。

## hash 長什麼樣：PHC string format

`argon2.hash('mypassword')` 產生的不是一串純 hash，而是一整段自帶元資料的字串：

```
$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG
   │         │      │              │            │
 演算法id    版本  參數            salt         實際 hash
          (19)  (記憶體/迭代/平行) (base64)     (base64)
```

用 `$` 分隔成多段，**salt 和最終 hash 都包在同一個字串裡**。
這是一個共通規範叫 **PHC string format**：`$<id>$<version>$<params>$<salt>$<hash>`，
bcrypt（`$2b$...`）、scrypt、argon2 都遵循類似結構。

## 為什麼 verify 不用傳 salt

`hash` 字串自帶驗證需要的一切。`argon2.verify(hash, plain)` 內部：

1. **解析** `hash` → 拆出演算法、版本、參數、salt、原始 hash
2. 用解析出的**同一組 salt + 同一組參數**，對 `plain` 重算一次
3. 跟字串裡的原始 hash 做**常數時間比較**（防 timing attack），相等即密碼正確

## 為什麼用 `$` 分段而不是固定欄位寬度（聰明的點）

固定「前 16 bytes 是 salt」會立刻卡住三件事，分隔符格式都解掉：

1. **salt 長度可變** —— 不被固定寬度綁死，把「長度」交給「下一個 `$` 在哪」
2. **參數可一起存** —— `m`/`t`/`p` 未來調強時，舊密碼仍能用「當初的參數」驗證
3. **演算法/版本可共存** —— 開頭 `$argon2id$v=19$` 標明身分，同一欄位裡舊 bcrypt 與新 argon2 並存，verify 看開頭就知道怎麼解

> 小修正：`$` 之間的 salt 是 **base64 編碼**（不是原始 bytes）。
> salt 是隨機 binary，可能含 `$` 或換行，base64 轉成安全 ASCII 才能塞進字串、又能任意長度。

## 最重要的延伸：同密碼 hash 兩次結果不同

salt 每次隨機 → 同一個密碼 hash 兩次得到**完全不同**的字串：

```ts
await argon2.hash('root1234')  // $argon2id$...AAA...
await argon2.hash('root1234')  // $argon2id$...BBB...  ← 不一樣！
```

所以**永遠不能**用字串相等比密碼（`stored === hash(input)` 永遠 false），
一定要走 `argon2.verify()`。這跟純 hash（sha256：同輸入永遠同輸出、無 salt）的世界觀相反。

## 純 hash vs password hashing function

| | 純 hash（sha256…） | password hashing（argon2/bcrypt/scrypt） |
|---|---|---|
| salt | 無 | 每次隨機，內嵌輸出 |
| 同輸入同輸出 | 是 | 否 |
| 速度 | 快（不利防爆破） | 刻意慢、吃記憶體（抗暴力/GPU） |
| 比對方式 | 再 hash 一次比字串 | `verify()` 解析後重算比對 |
| 用途 | 檔案校驗、index | **存密碼** |

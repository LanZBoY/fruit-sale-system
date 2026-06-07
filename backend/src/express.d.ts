// 全域擴充 Express 的 Request，讓 req.user 有型別（由 authenticate middleware 掛上）。
// import 讓本檔成為 module，declare global 才會「擴充」而非「覆蓋」原型別。
import type { AuthUser } from './types.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};

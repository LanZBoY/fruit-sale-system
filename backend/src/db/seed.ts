import { pool } from './pool.js';
import { hashPassword } from '../lib/auth.js';
import type { Role } from '../types.js';

type SeedUser = { username: string; display_name: string; role: Role; password: string };
type SeedProduct = { name: string; price: number; stock: number; listed?: boolean };

/** 初始化示範資料（idempotent，已存在則略過） */
export async function seed(): Promise<void> {
  const { rows } = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) {
    console.log('[seed] 已有資料，略過');
    return;
  }

  console.log('[seed] 建立示範使用者與商品…');

  const users: SeedUser[] = [
    // Root 超級管理員（最高權限，供系統維運使用）
    { username: 'root', display_name: 'Root 超級管理員', role: 'admin', password: 'root1234' },
    { username: 'admin', display_name: '系統管理員', role: 'admin', password: 'admin123' },
    { username: 'sales', display_name: '王銷售', role: 'sales', password: 'sales123' },
    { username: 'shipper', display_name: '李出貨', role: 'shipper', password: 'shipper123' },
  ];
  for (const u of users) {
    const hash = await hashPassword(u.password);
    await pool.query(
      `INSERT INTO users (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)`,
      [u.username, hash, u.display_name, u.role]
    );
  }

  const products: SeedProduct[] = [
    { name: '愛文芒果', price: 250, stock: 100 },
    { name: '玉荷包荔枝', price: 500, stock: 60 },
    { name: '澳洲紅地球葡萄', price: 320, stock: 80 },
    { name: '麝香葡萄', price: 680, stock: 40 },
    { name: '黑珍珠蓮霧', price: 200, stock: 0, listed: false },
  ];
  for (const p of products) {
    await pool.query(
      `INSERT INTO products (name, price, stock_qty, is_listed)
       VALUES ($1, $2, $3, $4)`,
      [p.name, p.price, p.stock, p.listed !== false]
    );
  }

  console.log(
    '[seed] 完成。預設帳號：root/root1234, admin/admin123, sales/sales123, shipper/shipper123'
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

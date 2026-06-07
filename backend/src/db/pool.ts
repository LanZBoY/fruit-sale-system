import pg from 'pg';
import { config } from '../config.js';

// decimal/numeric 以數字回傳，方便前端計算
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function query(text, params) {
  return pool.query(text, params);
}

/** 在單一交易中執行 fn(client)，自動 BEGIN / COMMIT / ROLLBACK */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

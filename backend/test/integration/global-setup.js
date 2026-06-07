import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

// 只取 migration 的 Up 段（檔案以「-- Down Migration」分隔上下）
function readUpMigration() {
  const sql = readFileSync(
    fileURLToPath(new URL('../../migrations/1717000000000_init.sql', import.meta.url)),
    'utf8'
  );
  return sql.split('-- Down Migration')[0];
}

/**
 * 全域只起一次：
 * - 若有 TEST_DATABASE_URL（CI 用 service container）→ 直接用
 * - 否則用 Testcontainers 起一顆拋棄式 postgres:16
 * 跑完 schema 後把連線字串 provide 給測試 worker。
 */
export default async function setup({ provide }) {
  let connectionUri = process.env.TEST_DATABASE_URL;
  let container;

  if (!connectionUri) {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('fruit_sales_test')
      .start();
    connectionUri = container.getConnectionUri();
  }

  // 建立 schema（只跑 Up 段）
  const client = new pg.Client({ connectionString: connectionUri });
  await client.connect();
  await client.query(readUpMigration());
  await client.end();

  provide('databaseUrl', connectionUri);

  return async () => {
    if (container) await container.stop();
  };
}

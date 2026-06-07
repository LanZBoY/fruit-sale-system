import migrationRunner from 'node-pg-migrate';
import { config } from '../config.js';
import { pool } from './pool.js';
import { seed } from './seed.js';

const migrationsDir = new URL('../../migrations', import.meta.url).pathname;

/** 等待資料庫就緒（docker compose 啟動時 db 可能尚未 ready） */
async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      console.log(`[db] 等待資料庫連線… (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('無法連線資料庫');
}

/** 啟動時自動跑 migration（up 全部）再 seed */
export async function migrate() {
  await waitForDb();
  const runner = migrationRunner.default || migrationRunner;
  await runner({
    databaseUrl: config.databaseUrl,
    dir: migrationsDir,
    direction: 'up',
    count: Infinity,
    migrationsTable: 'pgmigrations',
    log: (msg) => console.log(`[migrate] ${msg}`),
  });
  console.log('[db] migration 完成');
  await seed();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

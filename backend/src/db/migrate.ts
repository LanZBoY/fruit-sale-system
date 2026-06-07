import migrationRunner from 'node-pg-migrate';
import { config } from '../config.js';
import { pool } from './pool.js';
import { seed } from './seed.js';

const migrationsDir = new URL('../../migrations', import.meta.url).pathname;

/** 等待資料庫就緒（docker compose 啟動時 db 可能尚未 ready） */
async function waitForDb(retries = 30): Promise<void> {
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

// node-pg-migrate 的 default export 在 ESM/CJS interop 下可能包一層 .default，
// 其 RunnerOption 型別頗嚴格，這裡以寬鬆函式型別呼叫即可。
type Runner = (opts: Record<string, unknown>) => Promise<unknown>;

/** 啟動時自動跑 migration（up 全部）再 seed */
export async function migrate(): Promise<void> {
  await waitForDb();
  const runner = ((migrationRunner as unknown as { default?: Runner }).default ||
    (migrationRunner as unknown as Runner)) as Runner;
  await runner({
    databaseUrl: config.databaseUrl,
    dir: migrationsDir,
    direction: 'up',
    count: Infinity,
    migrationsTable: 'pgmigrations',
    log: (msg: string) => console.log(`[migrate] ${msg}`),
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

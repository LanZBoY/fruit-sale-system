import { defineConfig } from 'vitest/config';

// 兩組測試分開：
// - unit：不連 DB、不需要 Docker（純函式）
// - integration：用 Testcontainers 起一顆拋棄式 postgres，跑真實 SQL
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.js'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/integration/**/*.test.js'],
          globalSetup: ['test/integration/global-setup.js'],
          // 整合測試共用同一顆容器；關閉檔案平行化，序列化跑避免 DB 狀態互相干擾
          pool: 'forks',
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000, // 首次可能要拉 postgres:16 image
        },
      },
    ],
  },
});

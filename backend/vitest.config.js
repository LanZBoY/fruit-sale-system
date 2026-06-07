import { defineConfig } from 'vitest/config';

// 兩組測試分開：
// - unit：不連 DB、不需要 Docker（純函式）
// - integration：用 Testcontainers 起一顆拋棄式 postgres，跑真實 SQL
export default defineConfig({
  test: {
    // 覆蓋率：以 --coverage 啟用，跨 unit/integration 兩組彙總
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // 進入點 / 純設定 / 即時推送等難以在自動化測試覆蓋，排除以免雜訊
      exclude: ['src/server.js', 'src/config.js', 'src/lib/realtime.js', 'src/lib/push.js'],
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
    },
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

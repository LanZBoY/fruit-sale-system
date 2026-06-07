import { describe, it, expect } from 'vitest';
import { taipeiDayRange, taipeiToday, taipeiOrderDatePrefix } from '../../src/lib/tz.js';

describe('taipeiDayRange', () => {
  it('指定日期：台北當日 00:00 = 前一天 16:00 UTC，區間長 24h', () => {
    const { start, end } = taipeiDayRange('2024-01-15');
    // 台北 2024-01-15 00:00 (UTC+8) === 2024-01-14T16:00:00Z
    expect(start.toISOString()).toBe('2024-01-14T16:00:00.000Z');
    expect(end.toISOString()).toBe('2024-01-15T16:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('不給日期時回傳「今日」的 24h 區間', () => {
    const { start, end } = taipeiDayRange();
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(start).toBeInstanceOf(Date);
  });
});

describe('taipeiToday / taipeiOrderDatePrefix', () => {
  it('today 格式為 YYYY-MM-DD', () => {
    expect(taipeiToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('訂單日期前綴為 8 碼 YYYYMMDD（today 去掉橫線）', () => {
    expect(taipeiOrderDatePrefix()).toMatch(/^\d{8}$/);
    expect(taipeiOrderDatePrefix()).toBe(taipeiToday().replace(/-/g, ''));
  });
});

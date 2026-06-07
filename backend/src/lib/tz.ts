// 一律以 Asia/Taipei (UTC+8) 計算「今日」
const TPE_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 回傳指定日期（或今日）在台北時區的 [起, 迄) UTC 邊界 */
export function taipeiDayRange(dateStr) {
  let base;
  if (dateStr) {
    // dateStr = 'YYYY-MM-DD'，視為台北當地 00:00
    base = new Date(`${dateStr}T00:00:00.000Z`).getTime() - TPE_OFFSET_MS;
  } else {
    const nowTpe = Date.now() + TPE_OFFSET_MS;
    const d = new Date(nowTpe);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    base = Date.UTC(y, m, day) - TPE_OFFSET_MS;
  }
  return { start: new Date(base), end: new Date(base + 24 * 60 * 60 * 1000) };
}

/** 台北今日字串 YYYY-MM-DD */
export function taipeiToday() {
  const d = new Date(Date.now() + TPE_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

/** 訂單編號用日期前綴 YYYYMMDD（台北） */
export function taipeiOrderDatePrefix() {
  return taipeiToday().replace(/-/g, '');
}

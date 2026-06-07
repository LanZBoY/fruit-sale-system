export function money(n) {
  return `$${Number(n || 0).toLocaleString('zh-TW')}`;
}

export function dateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeOnly(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const STATUS_LABEL = {
  pending: '待出貨',
  preparing: '備貨中',
  shipped: '已出貨',
};

export const STATUS_STYLE = {
  pending: 'bg-amber-100 text-amber-700',
  preparing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-green-100 text-green-700',
};

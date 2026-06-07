import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, apiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../hooks/useSocket';
import { subscribePush } from '../../lib/push';
import { timeOnly, STATUS_LABEL, STATUS_STYLE } from '../../lib/format';

const TABS = [
  { key: 'pending', label: '待出貨' },
  { key: 'preparing', label: '備貨中' },
  { key: 'shipped', label: '已出貨' },
];

const NEXT = { pending: { to: 'preparing', label: '開始備貨' }, preparing: { to: 'shipped', label: '完成出貨' } };

// 提示音（短嗶聲，避免額外音檔）
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    /* ignore */
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

export default function ShippingList() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState('pending');
  const [highlight, setHighlight] = useState(new Set());
  const [pushOn, setPushOn] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', 'shipping'],
    queryFn: async () => (await api.get('/orders/shipping')).data.data,
  });

  useSocket({
    'order.created': (order) => {
      qc.setQueryData(['orders', 'shipping'], (old = []) => [order, ...old.filter((o) => o.id !== order.id)]);
      setHighlight((h) => new Set(h).add(order.id));
      beep();
      toast.info(`新訂單：${order.customer_name}`);
    },
    'order.status_changed': () => qc.invalidateQueries({ queryKey: ['orders', 'shipping'] }),
  });

  // 斷線重連後補齊：window focus 時重新拉取
  useEffect(() => {
    const onFocus = () => qc.invalidateQueries({ queryKey: ['orders', 'shipping'] });
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [qc]);

  const advance = useMutation({
    mutationFn: async ({ id, to }) =>
      (await api.patch(`/orders/${id}/status`, { status: to })).data.data,
    onSuccess: (d) => {
      toast.success(`已更新為「${STATUS_LABEL[d.status]}」`);
      qc.invalidateQueries({ queryKey: ['orders', 'shipping'] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  async function enablePush() {
    const res = await subscribePush();
    if (res.ok) {
      setPushOn(true);
      toast.success('已開啟背景推播');
    } else {
      toast.error(res.reason);
    }
  }

  const list = orders.filter((o) => o.status === tab);
  const counts = TABS.reduce(
    (acc, t) => ({ ...acc, [t.key]: orders.filter((o) => o.status === t.key).length }),
    {}
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">出貨作業</h2>
        {!pushOn && (
          <button onClick={enablePush} className="text-sm text-brand underline">
            🔔 開啟通知
          </button>
        )}
      </div>

      {/* 分區 tabs */}
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex-1 rounded-lg py-2 text-sm font-medium ${
              tab === t.key ? 'bg-brand text-white' : 'bg-white text-gray-600 border'
            }`}
          >
            {t.label}
            <span className="ml-1 opacity-80">({counts[t.key] || 0})</span>
            {t.key === 'pending' && counts.pending > 0 && (
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-gray-400">載入中…</p>}
      {!isLoading && list.length === 0 && (
        <p className="py-8 text-center text-gray-400">目前沒有{STATUS_LABEL[tab]}的訂單</p>
      )}

      <div className="space-y-3">
        {list.map((o) => (
          <div
            key={o.id}
            className={`card p-4 ${highlight.has(o.id) ? 'ring-2 ring-brand animate-pulse' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-gray-500">{o.order_no}</span>
              <span className="text-sm text-gray-400">{timeOnly(o.created_at)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-bold">{o.customer_name}</span>
              <a href={`tel:${o.customer_phone}`} className="text-brand">
                📞 {o.customer_phone}
              </a>
            </div>
            <div className="my-2 border-t" />
            <ul className="space-y-1">
              {o.items.map((it, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span>{it.product_name}</span>
                  <span className="font-semibold">× {it.qty}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className={`badge ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
              {o.status === 'shipped' ? (
                <span className="text-sm text-gray-400">出貨於 {timeOnly(o.shipped_at)}</span>
              ) : (
                <button
                  onClick={() => {
                    setHighlight((h) => {
                      const n = new Set(h);
                      n.delete(o.id);
                      return n;
                    });
                    advance.mutate({ id: o.id, to: NEXT[o.status].to });
                  }}
                  disabled={advance.isPending}
                  className="btn-primary"
                >
                  {NEXT[o.status].label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

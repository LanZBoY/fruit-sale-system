import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { money, dateTime, STATUS_LABEL, STATUS_STYLE } from '../../lib/format';

export default function MyOrders() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', 'mine'],
    queryFn: async () => (await api.get('/orders/mine')).data.data,
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">我的訂單</h2>
      {isLoading && <p className="text-gray-400">載入中…</p>}
      {!isLoading && orders.length === 0 && (
        <p className="text-center text-gray-400">尚無訂單</p>
      )}
      {orders.map((o) => (
        <div key={o.id} className="card p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-gray-500">{o.order_no}</span>
            <span className={`badge ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-medium">{o.customer_name}</span>
            <span className="font-bold text-brand">{money(o.total_amount)}</span>
          </div>
          <div className="mt-1 text-xs text-gray-400">{dateTime(o.created_at)}</div>
        </div>
      ))}
    </div>
  );
}

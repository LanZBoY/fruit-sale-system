import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useSocket } from '../../hooks/useSocket';
import { timeOnly, STATUS_LABEL, STATUS_STYLE } from '../../lib/format';

const COLUMNS = ['pending', 'preparing', 'shipped'];

export default function Shipments() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({
    queryKey: ['orders', 'shipping'],
    queryFn: async () => (await api.get('/orders/shipping')).data.data,
  });

  // 即時更新出貨總覽
  useSocket({
    'order.created': () => qc.invalidateQueries({ queryKey: ['orders', 'shipping'] }),
    'order.status_changed': () => qc.invalidateQueries({ queryKey: ['orders', 'shipping'] }),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">出貨狀態總覽</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((status) => {
          const list = orders.filter((o) => o.status === status);
          return (
            <div key={status} className="rounded-xl bg-gray-50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className={`badge ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
                <span className="text-sm text-gray-400">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map((o) => (
                  <div key={o.id} className="card p-3">
                    <div className="flex justify-between">
                      <span className="font-mono text-xs text-gray-500">{o.order_no}</span>
                      <span className="text-xs text-gray-400">{timeOnly(o.created_at)}</span>
                    </div>
                    <div className="mt-1 font-medium">{o.customer_name}</div>
                    <div className="text-xs text-gray-500">
                      {o.items.map((i) => `${i.product_name}×${i.qty}`).join('、')}
                    </div>
                  </div>
                ))}
                {list.length === 0 && (
                  <p className="py-4 text-center text-sm text-gray-300">無</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useSocket } from '../../hooks/useSocket';
import { money } from '../../lib/format';

export default function SalesProducts() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', 'all-listed'],
    queryFn: async () => (await api.get('/products', { params: { listed: true } })).data.data,
  });

  // inventory.updated 即時更新庫存數字
  useSocket({
    'inventory.updated': ({ product_id, stock_qty }) => {
      qc.setQueryData(['products', 'all-listed'], (old) =>
        old?.map((p) => (p.id === product_id ? { ...p, stock_qty } : p))
      );
    },
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">商品庫存</h2>
      {isLoading && <p className="text-gray-400">載入中…</p>}
      {products.map((p) => (
        <div key={p.id} className="card flex items-center gap-3 p-3">
          <div className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-2xl">
            {p.image_url ? (
              <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
            ) : (
              '🍇'
            )}
          </div>
          <div className="flex-1">
            <div className="font-semibold">{p.name}</div>
            <div className="text-sm text-brand">{money(p.price)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">剩餘庫存</div>
            <div className={`text-lg font-bold ${p.stock_qty <= 0 ? 'text-red-500' : ''}`}>
              {p.stock_qty}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

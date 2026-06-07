import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, apiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../hooks/useSocket';
import { money } from '../../lib/format';

export default function NewOrder() {
  const toast = useToast();
  const qc = useQueryClient();
  const [customer, setCustomer] = useState({ id: null, name: '', phone: '' });
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({}); // { productId: { qty, unit_price, product } }

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'listed'],
    queryFn: async () => (await api.get('/products', { params: { listed: true } })).data.data,
  });

  // 客戶搜尋（電話/姓名）
  const { data: foundCustomers = [] } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => (await api.get('/customers', { params: { q: search } })).data.data,
    enabled: search.length >= 1,
  });

  // 即時庫存更新
  useSocket({
    'inventory.updated': ({ product_id, stock_qty }) => {
      qc.setQueryData(['products', 'listed'], (old) =>
        old?.map((p) => (p.id === product_id ? { ...p, stock_qty } : p))
      );
    },
  });

  const items = Object.values(cart);
  const total = useMemo(
    () => items.reduce((s, it) => s + it.qty * it.unit_price, 0),
    [items]
  );

  function addToCart(p) {
    setCart((c) => {
      if (c[p.id]) return c;
      return { ...c, [p.id]: { product: p, qty: 1, unit_price: Number(p.price) } };
    });
  }
  function updateItem(id, patch) {
    setCart((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  }
  function removeItem(id) {
    setCart((c) => {
      const n = { ...c };
      delete n[id];
      return n;
    });
  }

  const submit = useMutation({
    mutationFn: async () => {
      const payload = {
        customer: { id: customer.id, name: customer.name.trim(), phone: customer.phone.trim() },
        items: items.map((it) => ({
          product_id: it.product.id,
          qty: Number(it.qty),
          unit_price: Number(it.unit_price),
        })),
      };
      return (await api.post('/orders', payload)).data.data;
    },
    onSuccess: () => {
      toast.success('已送出，已通知出貨組');
      setCustomer({ id: null, name: '', phone: '' });
      setCart({});
      setSearch('');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  function onSubmit() {
    if (!customer.name.trim() || !customer.phone.trim())
      return toast.error('請輸入客戶姓名與電話');
    if (items.length === 0) return toast.error('請至少選擇一項商品');
    submit.mutate();
  }

  return (
    <div className="space-y-5">
      {/* 1. 客戶資料 */}
      <section className="card p-4">
        <h2 className="mb-3 font-bold">① 客戶資料</h2>
        <div className="space-y-3">
          <div className="relative">
            <label className="label">客戶電話 / 姓名（可搜尋既有客戶）</label>
            <input
              className="input"
              placeholder="輸入電話或姓名搜尋"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && foundCustomers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow-lg">
                {foundCustomers.map((c) => (
                  <button
                    key={c.id}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      setCustomer({ id: c.id, name: c.name, phone: c.phone });
                      setSearch('');
                    }}
                  >
                    {c.name}　<span className="text-gray-400">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">姓名</label>
              <input
                className="input"
                value={customer.name}
                onChange={(e) => setCustomer((c) => ({ ...c, id: null, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">電話</label>
              <input
                className="input"
                type="tel"
                inputMode="numeric"
                value={customer.phone}
                onChange={(e) => setCustomer((c) => ({ ...c, id: null, phone: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. 商品選擇 */}
      <section className="card p-4">
        <h2 className="mb-3 font-bold">② 商品選擇</h2>
        <div className="grid grid-cols-2 gap-3">
          {products.map((p) => {
            const inCart = !!cart[p.id];
            return (
              <button
                key={p.id}
                disabled={p.stock_qty <= 0}
                onClick={() => addToCart(p)}
                className={`flex flex-col overflow-hidden rounded-xl border text-left transition disabled:opacity-40 ${
                  inCart ? 'border-brand ring-2 ring-brand/30' : 'border-gray-200'
                }`}
              >
                <div className="flex h-24 items-center justify-center bg-gray-100 text-3xl">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    '🍇'
                  )}
                </div>
                <div className="p-2">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-gray-500">庫存 {p.stock_qty}</div>
                  <div className="text-sm font-bold text-brand">{money(p.price)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. 訂單明細 */}
      {items.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 font-bold">③ 訂單明細</h2>
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.product.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{it.product.name}</span>
                  <button
                    onClick={() => removeItem(it.product.id)}
                    className="text-sm text-red-500"
                  >
                    移除
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 items-end gap-2">
                  <div>
                    <label className="label">數量</label>
                    <input
                      type="number"
                      min="1"
                      max={it.product.stock_qty}
                      className="input py-1.5"
                      value={it.qty}
                      onChange={(e) =>
                        updateItem(it.product.id, { qty: Math.max(1, Number(e.target.value)) })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">單價</label>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      className="input py-1.5"
                      value={it.unit_price}
                      onChange={(e) =>
                        updateItem(it.product.id, { unit_price: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="text-right">
                    <label className="label">小計</label>
                    <div className="py-1.5 font-bold">{money(it.qty * it.unit_price)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <span className="font-bold">總金額</span>
            <span className="text-xl font-bold text-brand">{money(total)}</span>
          </div>
        </section>
      )}

      {/* 4. 送出 */}
      <button
        onClick={onSubmit}
        disabled={submit.isPending}
        className="btn-primary btn-lg w-full"
      >
        {submit.isPending ? '送出中…' : '送出訂單'}
      </button>
    </div>
  );
}

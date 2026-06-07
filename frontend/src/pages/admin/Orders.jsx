import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { money, dateTime, STATUS_LABEL, STATUS_STYLE } from '../../lib/format';

function OrderDetail({ id, onClose }) {
  const { data: order } = useQuery({
    queryKey: ['orders', id],
    queryFn: async () => (await api.get(`/orders/${id}`)).data.data,
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!order ? (
          <p className="text-gray-400">載入中…</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{order.order_no}</h2>
              <button onClick={onClose} className="text-gray-400">✕</button>
            </div>
            <span className={`badge mt-2 ${STATUS_STYLE[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
            <div className="mt-4 space-y-1 text-sm">
              <div>客戶：{order.customer_name}</div>
              <div>電話：{order.customer_phone}</div>
              <div>建立：{dateTime(order.created_at)}</div>
              {order.shipped_at && <div>出貨：{dateTime(order.shipped_at)}</div>}
            </div>

            <h3 className="mt-5 mb-2 font-semibold">商品明細</h3>
            <table className="w-full text-sm">
              <tbody>
                {order.items?.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="py-2">{it.product_name}</td>
                    <td className="py-2 text-right">× {it.qty}</td>
                    <td className="py-2 text-right">{money(it.unit_price)}</td>
                    <td className="py-2 text-right font-semibold">{money(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex justify-between border-t pt-2 font-bold">
              <span>總金額</span>
              <span className="text-brand">{money(order.total_amount)}</span>
            </div>

            <h3 className="mt-5 mb-2 font-semibold">狀態歷程</h3>
            <ul className="space-y-2 text-sm">
              {order.status_logs?.map((l) => (
                <li key={l.id} className="flex justify-between">
                  <span>
                    {l.from_status ? `${STATUS_LABEL[l.from_status]} → ` : ''}
                    {STATUS_LABEL[l.to_status]}
                    <span className="text-gray-400">（{l.changed_by_name}）</span>
                  </span>
                  <span className="text-gray-400">{dateTime(l.changed_at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminOrders() {
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });
  const [selected, setSelected] = useState(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', 'admin', filters],
    queryFn: async () => {
      const params = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.status) params.status = filters.status;
      return (await api.get('/orders', { params })).data.data;
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">訂單紀錄</h1>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">起始日</label>
          <input
            type="date"
            className="input w-auto"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">結束日</label>
          <input
            type="date"
            className="input w-auto"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">狀態</label>
          <select
            className="input w-auto"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">全部</option>
            <option value="pending">待出貨</option>
            <option value="preparing">備貨中</option>
            <option value="shipped">已出貨</option>
          </select>
        </div>
        <button
          className="btn-secondary"
          onClick={() => setFilters({ from: '', to: '', status: '' })}
        >
          清除
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">訂單編號</th>
              <th className="px-4 py-3">客戶</th>
              <th className="px-4 py-3 text-right">金額</th>
              <th className="px-4 py-3">狀態</th>
              <th className="px-4 py-3">時間</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan="5" className="px-4 py-6 text-center text-gray-400">載入中…</td></tr>
            )}
            {orders.map((o) => (
              <tr
                key={o.id}
                className="cursor-pointer border-t hover:bg-gray-50"
                onClick={() => setSelected(o.id)}
              >
                <td className="px-4 py-3 font-mono">{o.order_no}</td>
                <td className="px-4 py-3">{o.customer_name}</td>
                <td className="px-4 py-3 text-right font-semibold">{money(o.total_amount)}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{dateTime(o.created_at)}</td>
              </tr>
            ))}
            {!isLoading && orders.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-6 text-center text-gray-400">查無訂單</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <OrderDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

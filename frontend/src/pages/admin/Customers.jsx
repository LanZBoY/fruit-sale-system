import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { money, dateTime, STATUS_LABEL } from '../../lib/format';

function CustomerDetail({ id, onClose }) {
  const { data: c } = useQuery({
    queryKey: ['customers', id],
    queryFn: async () => (await api.get(`/customers/${id}`)).data.data,
  });
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6" onClick={(e) => e.stopPropagation()}>
        {!c ? (
          <p className="text-gray-400">載入中…</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{c.name}</h2>
              <button onClick={onClose} className="text-gray-400">✕</button>
            </div>
            <p className="text-gray-500">📞 {c.phone}</p>
            <h3 className="mt-5 mb-2 font-semibold">歷史訂單</h3>
            <ul className="space-y-2 text-sm">
              {c.orders?.map((o) => (
                <li key={o.id} className="flex justify-between border-b py-2">
                  <span className="font-mono">{o.order_no}</span>
                  <span>{STATUS_LABEL[o.status]}</span>
                  <span className="font-semibold">{money(o.total_amount)}</span>
                </li>
              ))}
              {c.orders?.length === 0 && <li className="text-gray-400">尚無訂單</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminCustomers() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);

  const { data: customers = [] } = useQuery({
    queryKey: ['admin-customers', q],
    queryFn: async () => (await api.get('/customers', { params: { q } })).data.data,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">客戶資料</h1>
      <input
        className="input max-w-sm"
        placeholder="搜尋姓名 / 電話"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">姓名</th>
              <th className="px-4 py-3">電話</th>
              <th className="px-4 py-3">建立時間</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3 text-gray-500">{dateTime(c.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-brand underline" onClick={() => setSelected(c.id)}>
                    歷史訂單
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <CustomerDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

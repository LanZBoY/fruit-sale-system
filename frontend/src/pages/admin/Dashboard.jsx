import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api } from '../../api/client';
import { useSocket } from '../../hooks/useSocket';
import { money } from '../../lib/format';

function StatCard({ label, value, accent }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${accent || ''}`}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const [date, setDate] = useState(today);

  const { data: summary } = useQuery({
    queryKey: ['stats', 'summary', date],
    queryFn: async () => (await api.get('/stats/summary', { params: { date } })).data.data,
  });

  const { data: ranking = [] } = useQuery({
    queryKey: ['stats', 'ranking', date],
    queryFn: async () =>
      (await api.get('/stats/product-ranking', { params: { from: date, to: date } })).data.data,
  });

  // 即時：有新訂單/狀態變更時刷新統計
  useSocket({
    'order.created': () => qc.invalidateQueries({ queryKey: ['stats'] }),
    'order.status_changed': () => qc.invalidateQueries({ queryKey: ['stats'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">儀表板</h1>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="input w-auto"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="今日營收" value={money(summary?.revenue)} accent="text-brand" />
        <StatCard label="今日訂單數" value={summary?.order_count ?? '-'} />
        <StatCard label="待出貨數" value={summary?.pending_count ?? '-'} accent="text-amber-600" />
        <StatCard label="已出貨數" value={summary?.shipped_count ?? '-'} accent="text-blue-600" />
      </div>

      <div className="card p-5">
        <h2 className="mb-4 font-bold">商品銷售排行</h2>
        {ranking.length === 0 ? (
          <p className="py-8 text-center text-gray-400">當日尚無銷售資料</p>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ranking} margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="product_name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v, n) => (n === 'amount' ? money(v) : v)} />
                  <Bar dataKey="amount" name="金額" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2">商品</th>
                  <th className="py-2 text-right">數量</th>
                  <th className="py-2 text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.product_id} className="border-t">
                    <td className="py-2">{r.product_name}</td>
                    <td className="py-2 text-right">{r.qty}</td>
                    <td className="py-2 text-right font-semibold">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

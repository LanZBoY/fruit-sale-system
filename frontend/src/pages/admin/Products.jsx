import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, apiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { money } from '../../lib/format';

const EMPTY = { name: '', price: 0, stock_qty: 0, is_listed: true };

function ProductModal({ product, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(product || EMPTY);
  const [file, setFile] = useState(null);
  const isEdit = !!product?.id;

  const save = useMutation({
    mutationFn: async () => {
      let saved;
      if (isEdit) {
        saved = (await api.put(`/products/${product.id}`, form)).data.data;
      } else {
        saved = (await api.post('/products', form)).data.data;
      }
      if (file) {
        const fd = new FormData();
        fd.append('image', file);
        saved = (
          await api.post(`/products/${saved.id}/image`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        ).data.data;
      }
      return saved;
    },
    onSuccess: () => {
      toast.success(isEdit ? '已更新商品' : '已新增商品');
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      onClose();
    },
    onError: (err) => toast.error(apiError(err)),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{isEdit ? '編輯商品' : '新增商品'}</h2>
        <div>
          <label className="label">商品名稱</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">定價</label>
            <input
              type="number"
              className="input"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="label">庫存數量</label>
            <input
              type="number"
              className="input"
              value={form.stock_qty}
              onChange={(e) => setForm((f) => ({ ...f, stock_qty: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div>
          <label className="label">商品圖片</label>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_listed}
            onChange={(e) => setForm((f) => ({ ...f, is_listed: e.target.checked }))}
          />
          上架
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminProducts() {
  const toast = useToast();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null); // null | {} | product

  const { data: products = [] } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => (await api.get('/products')).data.data,
  });

  const toggle = useMutation({
    mutationFn: async (p) =>
      (await api.patch(`/products/${p.id}/listing`, { is_listed: !p.is_listed })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-products'] }),
    onError: (err) => toast.error(apiError(err)),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">商品管理</h1>
        <button className="btn-primary" onClick={() => setModal({})}>+ 新增商品</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">圖片</th>
              <th className="px-4 py-3">名稱</th>
              <th className="px-4 py-3 text-right">定價</th>
              <th className="px-4 py-3 text-right">庫存</th>
              <th className="px-4 py-3">上架</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded bg-gray-100">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      '🍇'
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-right">{money(p.price)}</td>
                <td className="px-4 py-3 text-right">{p.stock_qty}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggle.mutate(p)}
                    className={`badge ${p.is_listed ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {p.is_listed ? '已上架' : '未上架'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-brand underline" onClick={() => setModal(p)}>編輯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ProductModal
          product={Object.keys(modal).length ? modal : null}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

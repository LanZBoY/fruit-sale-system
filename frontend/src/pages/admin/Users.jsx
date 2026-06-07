import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, apiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { dateTime } from '../../lib/format';

const ROLE_LABEL = { sales: '銷售組', shipper: '出貨組', admin: '管理者' };
const EMPTY = { username: '', password: '', display_name: '', role: 'sales' };

function UserModal({ user, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const isEdit = !!user?.id;
  const [form, setForm] = useState(
    isEdit ? { ...user, password: '' } : EMPTY
  );

  const save = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const body = { display_name: form.display_name, role: form.role };
        if (form.password) body.password = form.password;
        return (await api.put(`/users/${user.id}`, body)).data.data;
      }
      return (await api.post('/users', form)).data.data;
    },
    onSuccess: () => {
      toast.success(isEdit ? '已更新使用者' : '已建立使用者');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => toast.error(apiError(err)),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{isEdit ? '編輯使用者' : '新增使用者'}</h2>
        {!isEdit && (
          <div>
            <label className="label">帳號</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
          </div>
        )}
        <div>
          <label className="label">顯示名稱</label>
          <input
            className="input"
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">角色</label>
          <select
            className="input"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="sales">銷售組</option>
            <option value="shipper">出貨組</option>
            <option value="admin">管理者</option>
          </select>
        </div>
        <div>
          <label className="label">{isEdit ? '重設密碼（留空不變）' : '密碼'}</label>
          <input
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const toast = useToast();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data.data,
  });

  const toggle = useMutation({
    mutationFn: async (u) =>
      (await api.patch(`/users/${u.id}/active`, { is_active: !u.is_active })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => toast.error(apiError(err)),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">使用者管理</h1>
        <button className="btn-primary" onClick={() => setModal({})}>+ 新增使用者</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">帳號</th>
              <th className="px-4 py-3">名稱</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3">狀態</th>
              <th className="px-4 py-3">建立時間</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-3 font-mono">{u.username}</td>
                <td className="px-4 py-3">{u.display_name}</td>
                <td className="px-4 py-3">{ROLE_LABEL[u.role]}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggle.mutate(u)}
                    className={`badge ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {u.is_active ? '啟用' : '停用'}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500">{dateTime(u.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-brand underline" onClick={() => setModal(u)}>編輯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <UserModal user={Object.keys(modal).length ? modal : null} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

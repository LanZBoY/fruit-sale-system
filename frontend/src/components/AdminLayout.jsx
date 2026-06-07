import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/admin', label: '儀表板', icon: '📊', end: true },
  { to: '/admin/orders', label: '訂單紀錄', icon: '🧾' },
  { to: '/admin/products', label: '商品管理', icon: '🍎' },
  { to: '/admin/customers', label: '客戶資料', icon: '👤' },
  { to: '/admin/shipments', label: '出貨總覽', icon: '🚚' },
  { to: '/admin/users', label: '使用者管理', icon: '⚙️' },
];

/** 管理後台版面：桌面左側選單 + 主內容 */
export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-full">
      <aside className="flex w-60 flex-col bg-gray-900 text-gray-200">
        <div className="px-5 py-5">
          <h1 className="text-lg font-bold text-white">🍊 水果出貨後台</h1>
          <p className="mt-1 text-xs text-gray-400">{user?.display_name}（管理者）</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive ? 'bg-brand text-white' : 'hover:bg-gray-800'
                }`
              }
            >
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="m-3 rounded-lg px-3 py-2 text-sm hover:bg-gray-800">
          登出
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-100 p-6">
        <Outlet />
      </main>
    </div>
  );
}

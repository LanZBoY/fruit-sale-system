import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** 手機版版面：頂部標題 + 底部導覽列（銷售組 / 出貨組共用） */
export default function MobileLayout({ title, tabs }) {
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-gray-50">
      <header className="flex items-center justify-between bg-brand px-4 py-3 text-white shadow">
        <div>
          <h1 className="text-base font-bold leading-tight">{title}</h1>
          <p className="text-xs opacity-80">{user?.display_name}</p>
        </div>
        <button onClick={logout} className="text-sm underline opacity-90">
          登出
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md border-t border-gray-200 bg-white">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                isActive ? 'text-brand font-semibold' : 'text-gray-400'
              }`
            }
          >
            <span className="text-xl">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, homePathForRole } from '../context/AuthContext';

/** 路由守衛：未登入導 /login；角色不符導回自身首頁 */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">載入中…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return <Outlet />;
}

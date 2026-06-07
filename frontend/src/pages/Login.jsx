import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, homePathForRole } from '../context/AuthContext';
import { apiError } from '../api/client';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      navigate(homePathForRole(user.role), { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-b from-brand to-brand-dark p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-5 p-6">
        <div className="text-center">
          <div className="text-4xl">🍊</div>
          <h1 className="mt-2 text-xl font-bold">水果銷售出貨系統</h1>
          <p className="text-sm text-gray-500">請登入</p>
        </div>

        <div>
          <label className="label">帳號</label>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className="label">密碼</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <button type="submit" disabled={loading} className="btn-primary btn-lg w-full">
          {loading ? '登入中…' : '登入'}
        </button>

        <p className="text-center text-xs text-gray-400">
          測試帳號：admin / sales / shipper（密碼見 README）
        </p>
      </form>
    </div>
  );
}

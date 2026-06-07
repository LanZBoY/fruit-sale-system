import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.access) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.data.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { access_token, refresh_token, user } = res.data.data;
    tokenStore.set({ access_token, refresh_token });
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', { refresh_token: tokenStore.refresh });
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** 角色登入後的預設首頁 */
export function homePathForRole(role) {
  return role === 'sales' ? '/sales/new-order' : role === 'shipper' ? '/shipper' : '/admin';
}

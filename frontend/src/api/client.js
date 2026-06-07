import axios from 'axios';

const TOKEN_KEY = 'fruit_access_token';
const REFRESH_KEY = 'fruit_refresh_token';

export const tokenStore = {
  get access() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ access_token, refresh_token }) {
    if (access_token) localStorage.setItem(TOKEN_KEY, access_token);
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api = axios.create({ baseURL: '/api/v1' });

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 自動嘗試 refresh，失敗則登出
let refreshing = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    if (status === 401 && !original._retry && tokenStore.refresh) {
      original._retry = true;
      try {
        refreshing =
          refreshing ||
          axios.post('/api/v1/auth/refresh', { refresh_token: tokenStore.refresh });
        const { data } = await refreshing;
        refreshing = null;
        tokenStore.set(data.data);
        original.headers.Authorization = `Bearer ${data.data.access_token}`;
        return api(original);
      } catch (e) {
        refreshing = null;
        tokenStore.clear();
        if (location.pathname !== '/login') location.href = '/login';
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
);

/** 取出後端統一錯誤訊息 */
export function apiError(err) {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.error?.code ||
    err?.message ||
    '發生未知錯誤'
  );
}

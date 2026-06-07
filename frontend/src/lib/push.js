import { api } from '../api/client';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** 出貨組訂閱 Web Push 背景通知 */
export async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: '此裝置不支援推播' };
  }
  const { data } = await api.get('/push/public-key');
  if (!data.data.enabled || !data.data.public_key) {
    return { ok: false, reason: '伺服器未啟用推播' };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: '未授權通知' };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.data.public_key),
  });
  await api.post('/push/subscribe', { subscription: sub });
  return { ok: true };
}

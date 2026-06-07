import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { tokenStore } from '../api/client';

/**
 * 建立 socket.io 連線（帶 JWT），訂閱事件。
 * handlers: { 'order.created': fn, 'order.status_changed': fn, 'inventory.updated': fn }
 */
export function useSocket(handlers, deps = []) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const token = tokenStore.access;
    if (!token) return;

    const socket = io({ path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'] });

    const events = ['order.created', 'order.status_changed', 'inventory.updated'];
    events.forEach((evt) => {
      socket.on(evt, (payload) => handlersRef.current[evt]?.(payload));
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

import { Server } from 'socket.io';
import { verifyAccessToken } from './auth.js';
import { config } from '../config.js';

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, credentials: true },
    path: '/socket.io',
  });

  // 連線時驗證 JWT，依角色加入房間
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = verifyAccessToken(token);
      socket.data.user = { id: payload.sub, role: payload.role };
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { role, id } = socket.data.user;
    socket.join(`role:${role}`);
    socket.join(`user:${id}`);
  });

  return io;
}

/** order.created：admin 收到含金額版本，shipper 收到無金額版本 */
export function emitOrderCreated({ full, shipping }) {
  if (!io) return;
  io.to('role:admin').emit('order.created', full);
  io.to('role:shipper').emit('order.created', shipping);
}

export function emitStatusChanged(payload) {
  if (!io) return;
  io.to('role:admin').emit('order.status_changed', payload);
  io.to('role:shipper').emit('order.status_changed', payload);
}

export function emitInventoryUpdated(payload) {
  if (!io) return;
  io.to('role:admin').emit('inventory.updated', payload);
  io.to('role:sales').emit('inventory.updated', payload);
}

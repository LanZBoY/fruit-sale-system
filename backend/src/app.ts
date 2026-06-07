import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler, fail } from './lib/errors.js';

import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/products.routes.js';
import customerRoutes from './routes/customers.routes.js';
import orderRoutes from './routes/orders.routes.js';
import statsRoutes from './routes/stats.routes.js';
import userRoutes from './routes/users.routes.js';
import pushRoutes from './routes/push.routes.js';

export function createApp(): express.Express {
  const app = express();
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  // 商品圖片靜態服務
  app.use('/uploads', express.static(config.uploadDir));

  app.get('/api/v1/health', (_req: Request, res: Response) =>
    res.json({ data: { status: 'ok' } })
  );

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/products', productRoutes);
  api.use('/customers', customerRoutes);
  api.use('/orders', orderRoutes);
  api.use('/stats', statsRoutes);
  api.use('/users', userRoutes);
  api.use('/push', pushRoutes);
  app.use('/api/v1', api);

  app.use((_req: Request, res: Response) => fail(res, 'NOT_FOUND', '找不到資源', 404));
  app.use(errorHandler);

  return app;
}

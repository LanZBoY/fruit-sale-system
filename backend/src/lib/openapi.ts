// OpenAPI / 驗證單一來源
//
// 核心理念（取代手寫 @openapi 註解字串）：每個端點只定義一份 zod schema，
// 同一份同時用來 ①執行期驗證輸入 ②自動生成 OpenAPI 文件。schema 即真相，不會漂移。
//
// 用法：在 route 檔以 documented({...}) 取代手寫驗證與註解，它會
//   - 把這條路徑註冊進 OpenAPI registry（產生文件）
//   - 回傳一個驗證 middleware（驗 params/query/body，失敗丟 VALIDATION_ERROR/400）
// app.ts 在掛完所有 route 後呼叫 buildOpenapiDoc() 取得完整文件。

import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

extendZodWithOpenApi(z);
export { z };

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

// ---- 共用基礎型別 ----
const dateTime = () => z.string().openapi({ format: 'date-time', example: '2026-06-08T10:00:00.000Z' });

/** 成功回應信封 { data: ... } */
export const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ data });

// ---- 共用 component schemas（被多支 route 以 $ref 引用）----
export const ErrorSchema = registry.register(
  'Error',
  z
    .object({
      error: z.object({ code: z.string(), message: z.string() }),
    })
    .openapi('Error')
);

export const PublicUserSchema = registry.register(
  'PublicUser',
  z
    .object({
      id: z.string(),
      username: z.string(),
      display_name: z.string(),
      role: z.enum(['sales', 'shipper', 'admin']),
    })
    .openapi('PublicUser')
);

export const ProductSchema = registry.register(
  'Product',
  z
    .object({
      id: z.string(),
      name: z.string(),
      image_url: z.string().nullable(),
      price: z.number(),
      stock_qty: z.number().int(),
      is_listed: z.boolean(),
      created_at: dateTime(),
      updated_at: dateTime(),
    })
    .openapi('Product')
);

export const OrderItemSchema = registry.register(
  'OrderItem',
  z
    .object({
      id: z.string(),
      order_id: z.string(),
      product_id: z.string(),
      product_name: z.string(),
      qty: z.number().int(),
      unit_price: z.number(),
      subtotal: z.number(),
    })
    .openapi('OrderItem')
);

const orderBase = {
  id: z.string(),
  order_no: z.string(),
  customer_id: z.string().nullable(),
  customer_name: z.string(),
  customer_phone: z.string(),
  total_amount: z.number(),
  status: z.enum(['pending', 'preparing', 'shipped']),
  created_by: z.string(),
  created_at: dateTime(),
  shipped_at: dateTime().nullable(),
};

export const OrderDetailSchema = registry.register(
  'OrderDetail',
  z
    .object({ ...orderBase, items: z.array(OrderItemSchema).optional() })
    .openapi('OrderDetail')
);

export const OrderDetailWithLogsSchema = registry.register(
  'OrderDetailWithLogs',
  z
    .object({
      ...orderBase,
      items: z.array(OrderItemSchema),
      status_logs: z.array(
        z.object({
          id: z.string(),
          order_id: z.string(),
          from_status: z.enum(['pending', 'preparing', 'shipped']).nullable(),
          to_status: z.enum(['pending', 'preparing', 'shipped']),
          changed_by: z.string(),
          changed_by_name: z.string().optional(),
          changed_at: dateTime(),
        })
      ),
    })
    .openapi('OrderDetailWithLogs')
);

/** 出貨組視角：無金額 */
export const OrderShippingViewSchema = registry.register(
  'OrderShippingView',
  z
    .object({
      id: z.string(),
      order_no: z.string(),
      status: z.enum(['pending', 'preparing', 'shipped']),
      customer_name: z.string(),
      customer_phone: z.string(),
      created_at: dateTime(),
      shipped_at: dateTime().nullable(),
      items: z.array(z.object({ product_name: z.string(), qty: z.number().int() })),
    })
    .openapi('OrderShippingView')
);

// ---- documented()：註冊路徑 + 產生驗證 middleware ----
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type RequestSchemas = {
  params?: z.AnyZodObject;
  query?: z.AnyZodObject;
  body?: z.ZodTypeAny;
  /** body 內容型別，預設 application/json；檔案上傳用 multipart/form-data（不做 JSON 驗證） */
  bodyContentType?: string;
};

type ResponseSpec = { description: string; schema?: z.ZodTypeAny };

export type DocumentedRoute = {
  method: HttpMethod;
  /** 完整路徑，含 /api/v1 前綴與 {param} 形式，如 /api/v1/orders/{id} */
  path: string;
  tags: string[];
  summary: string;
  description?: string;
  /** 是否需要 bearerAuth */
  security?: boolean;
  request?: RequestSchemas;
  responses: Record<number, ResponseSpec>;
};

/** 把 zod 錯誤整理成一句人類可讀訊息 */
function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join('；');
}

/** 純驗證 middleware（也可單獨使用）。失敗丟 AppError('VALIDATION_ERROR') → 400。 */
export function validate(schemas: RequestSchemas): RequestHandler {
  const json = schemas.bodyContentType == null || schemas.bodyContentType === 'application/json';
  return (req, _res, next) => {
    try {
      if (schemas.params) schemas.params.parse(req.params);
      if (schemas.query) schemas.query.parse(req.query);
      if (json && schemas.body) schemas.body.parse(req.body ?? {});
      next();
    } catch (e) {
      if (e instanceof z.ZodError) {
        return next(new AppError('VALIDATION_ERROR', formatZodError(e)));
      }
      return next(e);
    }
  };
}

const noop: RequestHandler = (_req, _res, next) => next();

/**
 * 在 route 註冊一條有文件的端點。回傳值放進 router 的 middleware 鏈。
 * 範例：router.post('/', authenticate, documented({...}), asyncHandler(...))
 */
export function documented(def: DocumentedRoute): RequestHandler {
  const req = def.request;
  const bodyContentType = req?.bodyContentType ?? 'application/json';

  registry.registerPath({
    method: def.method,
    path: def.path,
    summary: def.summary,
    ...(def.description ? { description: def.description } : {}),
    tags: def.tags,
    ...(def.security ? { security: [{ bearerAuth: [] }] } : {}),
    request: {
      ...(req?.params ? { params: req.params } : {}),
      ...(req?.query ? { query: req.query } : {}),
      ...(req?.body
        ? { body: { content: { [bodyContentType]: { schema: req.body } } } }
        : {}),
    },
    responses: Object.fromEntries(
      Object.entries(def.responses).map(([code, r]) => [
        code,
        {
          description: r.description,
          ...(r.schema
            ? { content: { 'application/json': { schema: r.schema } } }
            : {}),
        },
      ])
    ),
  });

  return req && (req.params || req.query || req.body) ? validate(req) : noop;
}

/** 掛完所有 route 後呼叫，產生完整 OpenAPI 文件。 */
export function buildOpenapiDoc() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: '水果銷售出貨系統 API',
      version: '1.0.0',
      description: '銷售下單 → 出貨備貨 → 管理統計。三種角色：sales / shipper / admin。',
    },
    servers: [{ url: '/', description: '同源' }],
    tags: [
      { name: 'Auth', description: '登入與身分' },
      { name: 'Products', description: '商品' },
      { name: 'Customers', description: '客戶' },
      { name: 'Orders', description: '訂單與出貨' },
      { name: 'Stats', description: '統計（admin）' },
      { name: 'Users', description: '使用者管理（admin）' },
      { name: 'Push', description: 'Web Push 推播' },
    ],
  });
}

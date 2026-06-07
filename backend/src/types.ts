// 全專案共用型別（對應 migrations/1717000000000_init.sql 的資料模型）
//
// 註：DB 資料列刻意用 `type`（而非 interface）—— pg 的 query<T> 要求 T 符合
// QueryResultRow（含 index signature），type alias 物件字面量會自帶隱含 index
// signature，interface 不會，故用 type 才能直接餵給 pool.query<T>。

export type Role = 'sales' | 'shipper' | 'admin';
export type OrderStatus = 'pending' | 'preparing' | 'shipped';

// ---- DB 資料列（pg 回傳）----
// numeric 欄位經 pool.ts 的 type parser 轉成 number；timestamptz 回傳 Date。

export type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  created_at: Date;
};

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  created_at: Date;
};

export type ProductRow = {
  id: string;
  name: string;
  image_url: string | null;
  price: number;
  stock_qty: number;
  is_listed: boolean;
  created_at: Date;
  updated_at: Date;
};

export type OrderRow = {
  id: string;
  order_no: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  status: OrderStatus;
  created_by: string;
  created_at: Date;
  shipped_at: Date | null;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
};

export type ShipmentStatusLogRow = {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string;
  changed_at: Date;
};

// ---- 驗證後掛在 req.user 的使用者（authenticate middleware）----
export type AuthUser = {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  is_active: boolean;
};

// JWT payload
export type AccessTokenPayload = {
  sub: string;
  role: Role;
  name: string;
  typ: 'access';
};
export type RefreshTokenPayload = {
  sub: string;
  role: Role;
  typ: 'refresh';
};

// 註：Express Request 的 req.user 型別擴充放在 src/express.d.ts

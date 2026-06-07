-- Up Migration
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('sales', 'shipper', 'admin');
CREATE TYPE order_status AS ENUM ('pending', 'preparing', 'shipped');

-- 2.1 使用者
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          user_role NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2 客戶
CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_phone ON customers (phone);

-- 2.3 商品
CREATE TABLE products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  image_url  TEXT,
  price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_qty  INTEGER NOT NULL DEFAULT 0,
  is_listed  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_is_listed ON products (is_listed);

-- 2.4 訂單
CREATE TABLE orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no       TEXT NOT NULL UNIQUE,
  customer_id    UUID REFERENCES customers(id),
  customer_name  TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  status         order_status NOT NULL DEFAULT 'pending',
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  shipped_at     TIMESTAMPTZ
);
CREATE INDEX idx_orders_created_at ON orders (created_at);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_created_by ON orders (created_by);

-- 2.5 訂單明細
CREATE TABLE order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  qty          INTEGER NOT NULL,
  unit_price   NUMERIC(12,2) NOT NULL,
  subtotal     NUMERIC(12,2) NOT NULL
);
CREATE INDEX idx_order_items_order_id ON order_items (order_id);
CREATE INDEX idx_order_items_product_id ON order_items (product_id);

-- 2.6 出貨狀態紀錄
CREATE TABLE shipment_status_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status   order_status NOT NULL,
  changed_by  UUID NOT NULL REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_status_logs_order_id ON shipment_status_logs (order_id);

-- Web Push 訂閱
CREATE TABLE push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS shipment_status_logs;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS order_status;
DROP TYPE IF EXISTS user_role;

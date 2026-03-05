-- =============================================
-- Coffee POS — Complete Database Setup
-- Run this entire script in Supabase SQL Editor
-- =============================================

-- 1. Menu Items
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'drink',
  price NUMERIC NOT NULL DEFAULT 0,
  cost NUMERIC NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_items DISABLE ROW LEVEL SECURITY;

-- 2. Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  total NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- 3. Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id),
  item_name TEXT NOT NULL,
  item_price NUMERIC NOT NULL DEFAULT 0,
  item_cost NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;

-- 4. Ingredients
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  current_stock NUMERIC NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ingredients DISABLE ROW LEVEL SECURITY;

-- 5. Purchases (Costing)
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  supplier TEXT,
  notes TEXT,
  purchased_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE purchases DISABLE ROW LEVEL SECURITY;

-- 6. Daily Summary (View) — used by Dashboard
CREATE OR REPLACE VIEW daily_summary AS
SELECT
  DATE(created_at) AS sale_date,
  COUNT(*)::INTEGER AS total_orders,
  COALESCE(SUM(total), 0) AS total_revenue,
  COALESCE(SUM(total_cost), 0) AS total_cogs,
  COALESCE(SUM(total) - SUM(total_cost), 0) AS gross_profit,
  CASE
    WHEN SUM(total) > 0
    THEN ROUND(((SUM(total) - SUM(total_cost)) / SUM(total)) * 100, 1)
    ELSE 0
  END AS margin_percent
FROM orders
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY sale_date DESC;

-- 7. Item Popularity (View) — used by Dashboard
CREATE OR REPLACE VIEW item_popularity AS
SELECT
  oi.item_name,
  SUM(oi.quantity)::INTEGER AS total_sold,
  COALESCE(SUM(oi.item_price * oi.quantity), 0) AS total_revenue,
  COALESCE(SUM(oi.item_cost * oi.quantity), 0) AS total_cost,
  COALESCE(SUM((oi.item_price - oi.item_cost) * oi.quantity), 0) AS total_profit
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'completed'
GROUP BY oi.item_name
ORDER BY total_sold DESC;

-- Done! All tables created with RLS disabled.

-- =============================================
-- Stock Tracking Migration
-- Run this in Supabase SQL Editor AFTER the initial setup
-- =============================================

-- 1. Add missing columns to ingredients
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'ingredients';

-- 2. Stock Logs — tracks every stock movement
CREATE TABLE IF NOT EXISTS stock_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,        -- 'purchase', 'sale', 'spoiled', 'calibration', 'tasting', 'adjustment'
  quantity NUMERIC NOT NULL, -- positive = stock in, negative = stock out
  reference_id UUID,         -- optional: purchase_id or order_id that triggered this
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_logs DISABLE ROW LEVEL SECURITY;

-- 3. Menu Item Ingredients (recipes) — if not already created
CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_item_ingredients DISABLE ROW LEVEL SECURITY;

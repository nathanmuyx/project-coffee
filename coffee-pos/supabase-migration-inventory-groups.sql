-- Migration: Inventory Groups
-- Run in Supabase SQL Editor

-- 1. Create inventory_groups table
CREATE TABLE IF NOT EXISTS inventory_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE inventory_groups DISABLE ROW LEVEL SECURITY;

-- 2. Seed default groups
INSERT INTO inventory_groups (name, color, sort_order) VALUES
  ('Beans',        '#92400E', 0),
  ('Milk & Dairy', '#2563EB', 1),
  ('Syrups',       '#D97706', 2),
  ('Sweeteners',   '#DB2777', 3),
  ('Powders',      '#7C3AED', 4),
  ('Packaging',    '#F59E0B', 5),
  ('Equipment',    '#14B8A6', 6),
  ('Supplies',     '#EC4899', 7),
  ('Other',        '#9CA3AF', 8);

-- 3. Add group_id FK to ingredients
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES inventory_groups(id) ON DELETE SET NULL;

-- 4. Backfill existing ingredients based on category field
UPDATE ingredients SET group_id = (SELECT id FROM inventory_groups WHERE name = 'Beans') WHERE category = 'beans';
UPDATE ingredients SET group_id = (SELECT id FROM inventory_groups WHERE name = 'Milk & Dairy') WHERE category = 'milk';
UPDATE ingredients SET group_id = (SELECT id FROM inventory_groups WHERE name = 'Syrups') WHERE category = 'syrup';
UPDATE ingredients SET group_id = (SELECT id FROM inventory_groups WHERE name = 'Sweeteners') WHERE category = 'sweetener';
UPDATE ingredients SET group_id = (SELECT id FROM inventory_groups WHERE name = 'Powders') WHERE category = 'powder';
UPDATE ingredients SET group_id = (SELECT id FROM inventory_groups WHERE name = 'Packaging') WHERE category = 'packaging';
UPDATE ingredients SET group_id = (SELECT id FROM inventory_groups WHERE name = 'Equipment') WHERE category = 'equipment';
UPDATE ingredients SET group_id = (SELECT id FROM inventory_groups WHERE name = 'Supplies') WHERE category = 'supplies';
UPDATE ingredients SET group_id = (SELECT id FROM inventory_groups WHERE name = 'Other') WHERE category IN ('other', 'ingredients');

-- Adds an image_url column to menu_items so each product owns its image.
-- Seeds existing items from the hardcoded mappings in lib/menu-config.ts so
-- the customer-facing /kiosk display does not regress.
--
-- Also relaxes the order_items.menu_item_id FK to ON DELETE SET NULL so that
-- menu items can be deleted while preserving order history (order_items
-- snapshots name/price/cost at sale time, so historical orders still render).

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_menu_item_id_fkey;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_menu_item_id_fkey
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL;

UPDATE menu_items SET image_url = '/drinks/oat-latte.png'           WHERE name IN ('Iced Latte Oat', 'Hot Oat Latte');
UPDATE menu_items SET image_url = '/drinks/caramel-latte.png'       WHERE name IN ('Iced Caramel Latte', 'Hot Caramel Latte');
UPDATE menu_items SET image_url = '/drinks/spanish-oat-latte.png'   WHERE name IN ('Iced Spanish Latte', 'Hot Spanish Oat Latte');
UPDATE menu_items SET image_url = '/drinks/americano.png'           WHERE name = 'Hot Americano';
UPDATE menu_items SET image_url = '/drinks/honey-citrus.png'        WHERE name = 'Honey Citrus';
UPDATE menu_items SET image_url = '/drinks/honey-citrus-coffee.png' WHERE name = 'Iced Honey Citrus Coffee';
UPDATE menu_items SET image_url = '/drinks/caramel-nc.png'          WHERE name = 'Iced Caramel None Coffee';
UPDATE menu_items SET image_url = '/drinks/matcha-latte.png'        WHERE name = 'Matcha Latte';
UPDATE menu_items SET image_url = '/drinks/dirty-matcha.png'        WHERE name = 'Iced Dirty Matcha Latte';
UPDATE menu_items SET image_url = '/drinks/matcha-spanish.png'      WHERE name = 'Matcha Spanish Latte';

-- Storage bucket (run separately in dashboard if SQL fails; this works on most Supabase projects):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images', 'menu-images', true)
--   ON CONFLICT (id) DO NOTHING;

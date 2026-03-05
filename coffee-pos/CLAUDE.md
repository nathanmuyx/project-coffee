# Coffee POS — Project Context

## Overview
Cross-platform mobile POS system for a coffee pop-up shop. Built with React Native + Expo + Supabase. All screens are in `app/` using Expo Router file-based tab navigation.

## Tech Stack
- **Framework**: React Native 0.81.5, Expo 54, TypeScript
- **Routing**: Expo Router (tab-based, 6 tabs)
- **Backend**: Supabase (PostgreSQL, RLS disabled, direct reads/writes)
- **State**: Local React hooks only — no Redux, no Context
- **Icons**: phosphor-react-native
- **Dates**: dayjs
- **Storage**: AsyncStorage for menu caching
- **Styling**: StyleSheet with design tokens in `constants/theme.ts`

## File Structure
```
app/
  _layout.tsx      — Tab navigation (POS, Orders, Stats, Menu, Costing, Dev)
  index.tsx        — POS screen: menu grid, multi-queue cart, payment, checkout (1291 lines)
  orders.tsx       — Order history, cancel/delete, add past orders with calendar (1067 lines)
  dashboard.tsx    — Analytics: today's stats, rent goal, best sellers, day history (461 lines)
  menu.tsx         — Menu items CRUD + ingredients CRUD + recipe builder (1403 lines)
  costing.tsx      — Purchase tracking, inventory grid, stock adjustments (1968 lines)
  developer.tsx    — Tech stack info + Supabase connection test (293 lines)
lib/
  supabase.ts      — Supabase client (URL + anon key)
  types.ts         — All TypeScript interfaces (MenuItem, Order, Ingredient, Purchase, StockLog, etc.)
  storage.ts       — AsyncStorage helpers for menu caching
constants/
  theme.ts         — Design tokens: colors, spacing, fontSize, fontWeight, borderRadius, shadow, categoryConfig, queueColors
```

## Database Schema (Supabase)

### Tables
- **menu_items** — id, name, category (drink|food|combo), price, cost, cost_is_manual, is_available, sort_order
- **orders** — id, order_number (serial), total, total_cost, status (pending|completed|cancelled), notes
- **order_items** — id, order_id (FK), menu_item_id (FK), item_name, item_price, item_cost, quantity
- **ingredients** — id, name, unit (ml|g|pcs), category, current_stock, cost_per_unit, low_stock_threshold
- **purchases** — id, item_name, category, quantity, unit, unit_cost, total_cost, content_quantity, content_unit, supplier, notes, purchased_at
- **menu_item_ingredients** — id, menu_item_id (FK), ingredient_id (FK), quantity (recipes linking menu items to ingredients)
- **stock_logs** — id, ingredient_id (FK), type (purchase|sale|spoiled|calibration|tasting|adjustment), quantity (+/-), reference_id, notes

### Views
- **daily_summary** — sale_date, total_orders, total_revenue, total_cogs, gross_profit, margin_percent
- **item_popularity** — item_name, total_sold, total_revenue, total_cost, total_profit

### SQL Files
- `supabase-setup.sql` — Full initial schema (menu_items, orders, order_items, ingredients, purchases, views)
- `supabase-migration-stock.sql` — Adds stock_logs, menu_item_ingredients tables, ingredients.category column

## Key Architecture Patterns

### POS Checkout Flow (index.tsx)
1. Insert order → 2. Insert order_items → 3. Look up recipes from menu_item_ingredients → 4. Aggregate ingredient usage → 5. Deduct from ingredients.current_stock → 6. Log to stock_logs (type='sale') → 7. Show success. Stock deduction is best-effort (try/catch, won't block checkout).

### Menu Loading
Cache-first from AsyncStorage, background refresh from Supabase. POS screen also fetches recipes (menu_item_ingredients with ingredient details) for cost calculation.

### Costing Purchase Flow (costing.tsx)
Two cost modes: **Itemized** (qty × unit_cost) and **Fixed** (flat amount). When category is 'ingredients' and content info is provided, auto-syncs to ingredients table (updates stock + cost_per_unit) and logs to stock_logs (type='purchase').

### Inventory Tracking
- Purchases of ingredients auto-add to stock
- Sales auto-deduct based on recipes
- Manual adjustments via stock adjustment modal (spoiled/calibration/tasting/other)
- Inventory grid in costing screen shows In Stock / Low / Empty badges

## Design Preferences
- Keep forms simple — no wizard/conversational UI (was tried and reverted)
- Dribbble-quality cards: avatar circles, soft shadows, no borders
- Incremental improvements over dramatic redesigns
- Currency: Philippine Peso (₱), formatted with `toLocaleString()`
- Category color coding: ingredients=#6366F1, packaging=#F59E0B, equipment=#14B8A6, supplies=#EC4899, other=#6B7280

## Common Patterns in Code
- `useFocusEffect` for data fetching on tab focus
- Modal-based forms with `showForm`/`setShowForm` pattern
- Pull-to-refresh with `RefreshControl`
- StyleSheet at bottom of each file, prefixed by section (e.g., `card*`, `form*`, `filter*`)
- Direct Supabase queries (no API layer, no abstraction)
- Alert.alert for error display

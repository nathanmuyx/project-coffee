export interface MenuItem {
  id: string;
  name: string;
  category: 'drink' | 'food' | 'combo';
  price: number;
  cost: number;
  cost_is_manual: boolean;
  is_available: boolean;
  sort_order: number;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

export interface QueueItem {
  id: string;
  label: string;
  colorIndex: number;
  cart: CartItem[];
}

export interface Order {
  id: string;
  order_number: number;
  total: number;
  total_cost: number;
  status: 'pending' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  item_price: number;
  item_cost: number;
  quantity: number;
}

export interface DailySummary {
  sale_date: string;
  total_orders: number;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  margin_percent: number;
}

export interface ItemPopularity {
  item_name: string;
  total_sold: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
}

export type IngredientCategory =
  | 'beans' | 'milk' | 'syrup' | 'sweetener' | 'powder'
  | 'ingredients' | 'packaging' | 'equipment' | 'supplies' | 'other';

export interface InventoryGroup {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: 'ml' | 'g' | 'pcs';
  category: string;
  group_id: string | null;
  current_stock: number;
  cost_per_unit: number;
  low_stock_threshold: number;
  sort_order: number;
}

export interface MenuItemIngredient {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity: number;
  ingredient?: Ingredient;
}

export interface RecipeEntry {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity: string;
  cost_per_unit: number;
}

// Costing / Purchases
export interface Purchase {
  id: string;
  item_name: string;
  category: PurchaseCategory;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  content_quantity: number | null;
  content_unit: string | null;
  supplier: string | null;
  notes: string | null;
  purchased_at: string;
  created_at: string;
}

export type PurchaseCategory =
  | 'ingredients'
  | 'packaging'
  | 'equipment'
  | 'supplies'
  | 'other';

// Stock tracking
export type StockLogType = 'purchase' | 'sale' | 'spoiled' | 'calibration' | 'tasting' | 'adjustment';

export interface StockLog {
  id: string;
  ingredient_id: string;
  type: StockLogType;
  quantity: number;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
}

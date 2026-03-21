export interface MenuItem {
  id: string;
  name: string;
  category: "drink" | "food" | "combo";
  price: number;
  cost: number;
  is_available: boolean;
  sort_order: number;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

export interface Order {
  id: string;
  order_number: number;
  total: number;
  total_cost: number;
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
  chip_number: number | null;
  payment_method: "cash" | "gcash" | "utang";
  receipt_url: string | null;
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

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  cost_per_unit: number;
  group_id: string | null;
}

export interface Purchase {
  id: string;
  ingredient_id: string;
  item_name: string;
  total_cost: number;
  quantity: number;
  content_quantity: number;
  content_unit: string;
  purchased_at: string;
}

export interface MenuItemIngredient {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity: number;
  ingredient?: Ingredient;
}

export interface StockLog {
  id: string;
  ingredient_id: string;
  type: "purchase" | "sale" | "adjustment";
  quantity: number;
  reference_id: string | null;
  created_at: string;
}

export interface InventoryGroup {
  id: string;
  name: string;
  sort_order: number;
}

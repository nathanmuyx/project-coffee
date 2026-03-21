import { supabase } from "@/lib/supabase";
import { OrderItem } from "@/lib/types";

export async function deductStockForOrder(orderId: string, orderItems: OrderItem[]) {
  const menuItemIds = [...new Set(orderItems.map((oi) => oi.menu_item_id))];
  const { data: recipes } = await supabase
    .from("menu_item_ingredients")
    .select("menu_item_id, ingredient_id, quantity")
    .in("menu_item_id", menuItemIds);

  if (!recipes || recipes.length === 0) return;

  // Aggregate: ingredient_id -> total qty to deduct
  const totals = new Map<string, number>();
  for (const oi of orderItems) {
    for (const r of recipes) {
      if (r.menu_item_id === oi.menu_item_id) {
        totals.set(r.ingredient_id, (totals.get(r.ingredient_id) ?? 0) + r.quantity * oi.quantity);
      }
    }
  }

  // Fetch current stock for all affected ingredients
  const ingredientIds = [...totals.keys()];
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, current_stock")
    .in("id", ingredientIds);

  if (!ingredients) return;

  // Decrement stock and insert logs
  const stockMap = new Map(ingredients.map((i) => [i.id, i.current_stock]));
  const logs = [];

  for (const [ingredientId, qty] of totals) {
    const current = stockMap.get(ingredientId) ?? 0;
    supabase
      .from("ingredients")
      .update({ current_stock: Math.max(0, current - qty) })
      .eq("id", ingredientId)
      .then(() => {});

    logs.push({
      ingredient_id: ingredientId,
      type: "sale",
      quantity: -qty,
      reference_id: orderId,
    });
  }

  if (logs.length > 0) {
    supabase.from("stock_logs").insert(logs).then(() => {});
  }
}

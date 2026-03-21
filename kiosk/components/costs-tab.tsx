"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Ingredient, Purchase } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function CostsTab() {
  const [view, setView] = useState<"form" | "history">("form");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  // Form state
  const [ingredientId, setIngredientId] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [contentQty, setContentQty] = useState("");
  const [contentUnit, setContentUnit] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [saving, setSaving] = useState(false);

  const fetchIngredients = useCallback(async () => {
    const { data } = await supabase
      .from("ingredients")
      .select("*")
      .order("name");
    if (data) setIngredients(data);
  }, []);

  const fetchPurchases = useCallback(async () => {
    const { data } = await supabase
      .from("purchases")
      .select("*")
      .order("purchased_at", { ascending: false })
      .limit(100);
    if (data) setPurchases(data);
  }, []);

  useEffect(() => {
    fetchIngredients();
    fetchPurchases();
  }, [fetchIngredients, fetchPurchases]);

  // Pre-fill content unit when ingredient changes
  const selectedIngredient = ingredients.find((i) => i.id === ingredientId);
  useEffect(() => {
    if (selectedIngredient) {
      setContentUnit(selectedIngredient.unit);
    }
  }, [selectedIngredient]);

  const handleSave = async () => {
    if (!ingredientId || !totalCost) return;
    setSaving(true);

    const qty = parseFloat(quantity) || 1;
    const cQty = parseFloat(contentQty) || 0;
    const cost = parseFloat(totalCost);
    const ingredient = ingredients.find((i) => i.id === ingredientId)!;

    // Total units purchased
    const totalUnits = cQty * qty;
    const newCostPerUnit = totalUnits > 0 ? cost / totalUnits : ingredient.cost_per_unit;

    // Insert purchase
    await supabase.from("purchases").insert({
      ingredient_id: ingredientId,
      item_name: ingredient.name,
      total_cost: cost,
      quantity: qty,
      content_quantity: cQty,
      content_unit: contentUnit || ingredient.unit,
      purchased_at: purchaseDate,
    });

    // Update ingredient cost_per_unit and increment stock
    await supabase
      .from("ingredients")
      .update({
        cost_per_unit: newCostPerUnit,
        current_stock: ingredient.current_stock + totalUnits,
      })
      .eq("id", ingredientId);

    // Stock log
    await supabase.from("stock_logs").insert({
      ingredient_id: ingredientId,
      type: "purchase",
      quantity: totalUnits,
    });

    // Reset form
    setTotalCost("");
    setQuantity("1");
    setContentQty("");
    setSaving(false);
    fetchIngredients();
    fetchPurchases();
  };

  // Group purchases by date
  const purchasesByDate = purchases.reduce<Record<string, Purchase[]>>(
    (acc, p) => {
      const date = p.purchased_at?.split("T")[0] ?? "Unknown";
      (acc[date] ??= []).push(p);
      return acc;
    },
    {}
  );

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
        <h1 className="text-lg font-extrabold">Costs</h1>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setView("form")}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
              view === "form"
                ? "bg-slate-600 text-white"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            Log Purchase
          </button>
          <button
            onClick={() => setView("history")}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
              view === "history"
                ? "bg-slate-600 text-white"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            History
          </button>
        </div>
      </div>

      {view === "form" ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Ingredient */}
          <div>
            <label className="text-xs font-bold text-slate-400 block mb-1">
              Ingredient
            </label>
            <select
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white"
            >
              <option value="">Select ingredient...</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit}) — stock: {i.current_stock}
                </option>
              ))}
            </select>
          </div>

          {/* Total cost */}
          <div>
            <label className="text-xs font-bold text-slate-400 block mb-1">
              Total Cost (what you paid)
            </label>
            <input
              type="number"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              placeholder="₱0"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white"
            />
          </div>

          {/* Quantity (how many units bought) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">
                Qty (e.g. 2 cartons)
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">
                Content per unit
              </label>
              <div className="flex gap-1">
                <input
                  type="number"
                  value={contentQty}
                  onChange={(e) => setContentQty(e.target.value)}
                  placeholder="e.g. 1000"
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white"
                />
                <span className="flex items-center px-2 text-xs text-slate-400 bg-slate-800 border border-slate-600 rounded-lg">
                  {contentUnit || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Cost preview */}
          {totalCost && contentQty && (
            <div className="bg-slate-800 rounded-lg p-3 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Total units</span>
                <span className="font-bold text-white">
                  {(parseFloat(contentQty) || 0) * (parseFloat(quantity) || 1)}{" "}
                  {contentUnit}
                </span>
              </div>
              <div className="flex justify-between text-slate-300 mt-1">
                <span>Cost per {contentUnit || "unit"}</span>
                <span className="font-bold text-emerald-400">
                  {formatCurrency(
                    parseFloat(totalCost) /
                      ((parseFloat(contentQty) || 1) *
                        (parseFloat(quantity) || 1))
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="text-xs font-bold text-slate-400 block mb-1">
              Date
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white"
            />
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!ingredientId || !totalCost || saving}
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-500 text-white font-bold text-sm transition-colors"
          >
            {saving ? "Saving..." : "Save Purchase"}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {Object.keys(purchasesByDate).length === 0 && (
            <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
              No purchases yet
            </div>
          )}
          {Object.entries(purchasesByDate).map(([date, items]) => (
            <div key={date}>
              <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700 sticky top-0">
                <span className="text-xs font-bold text-slate-400">{date}</span>
                <span className="text-xs text-slate-500 ml-2">
                  {formatCurrency(items.reduce((s, p) => s + p.total_cost, 0))}
                </span>
              </div>
              <div className="divide-y divide-slate-700/50">
                {items.map((p) => (
                  <div key={p.id} className="px-4 py-2.5">
                    <div className="flex justify-between">
                      <span className="text-sm font-semibold text-slate-200">
                        {p.item_name}
                      </span>
                      <span className="text-sm font-bold text-emerald-400">
                        {formatCurrency(p.total_cost)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {p.quantity} x {p.content_quantity}
                      {p.content_unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

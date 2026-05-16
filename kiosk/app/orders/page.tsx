"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Order, MenuItem, Ingredient, MenuItemIngredient, Modifier } from "@/lib/types";
import { formatCurrency, getShortName } from "@/lib/utils";
import { sendShowGcash, sendHideGcash, sendMenuRefresh } from "@/lib/kiosk-channel";
import { deductStockForOrder } from "@/lib/stock";
import CostsTab from "@/components/costs-tab";
import { ImagePickerModal } from "@/components/image-picker-modal";
import { ItemPickerModal } from "@/components/item-picker-modal";
import { CashChangeModal } from "@/components/cash-change-modal";
import { CashReceiptModal } from "@/components/cash-receipt-modal";
import { buildDisplayMenu, DisplayDrink } from "@/lib/menu-config";

interface CartLine {
  key: string;
  item: MenuItem;
  qty: number;
  modifiers: Modifier[];
}

const cartKey = (itemId: string, modifiers: Modifier[]) =>
  `${itemId}|${[...modifiers].map((m) => m.name).sort().join(",")}`;

const lineUnitPrice = (line: CartLine) =>
  line.item.price + line.modifiers.reduce((s, m) => s + m.price_delta, 0);
import { Snowflake, Fire } from "@phosphor-icons/react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const POLL_INTERVAL = 3000;
const MAX_BLOCK = 20;

const MATCHA_KEYWORDS = ["matcha"];
const COFFEE_KEYWORDS = ["latte", "americano", "espresso", "coffee"];
const MATCHA_EXCLUDE = ["dirty matcha"]; // dirty matcha = matcha + espresso

function classifyItem(name: string): { espresso: boolean; matcha: boolean } {
  const lower = name.toLowerCase();
  const isMatcha = MATCHA_KEYWORDS.some((k) => lower.includes(k));
  const isDirtyMatcha = MATCHA_EXCLUDE.some((k) => lower.includes(k));
  const isCoffee =
    isDirtyMatcha || COFFEE_KEYWORDS.some((k) => lower.includes(k));

  if (lower.includes("none coffee")) {
    return { espresso: false, matcha: isMatcha };
  }

  return {
    espresso: isCoffee && !lower.includes("none coffee"),
    matcha: isMatcha,
  };
}

export default function OrdersPage() {
  const [tab, setTab] = useState<"orders" | "pos" | "dashboard" | "costs">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const prevOrderIdsRef = useRef<Set<string>>(new Set());
  const [gcashShowing, setGcashShowing] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [posCart, setPosCart] = useState<Map<string, CartLine>>(new Map());
  const [posView, setPosView] = useState<"combined" | "separate">("separate");
  const [posPicker, setPosPicker] = useState<DisplayDrink | null>(null);
  const [cashCalculatorOpen, setCashCalculatorOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState(0);
  const [posCustomerName, setPosCustomerName] = useState("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("pos-view") : null;
    if (saved === "combined" || saved === "separate") setPosView(saved);
  }, []);

  const togglePosView = () => {
    const next = posView === "combined" ? "separate" : "combined";
    setPosView(next);
    if (typeof window !== "undefined") window.localStorage.setItem("pos-view", next);
  };

  const posDisplayMenu = useMemo(
    () => buildDisplayMenu(menuItems.filter((m) => m.is_available)),
    [menuItems]
  );
  const [cashModalOrder, setCashModalOrder] = useState<Order | null>(null);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [pushedAt, setPushedAt] = useState<number | null>(null);
  const [dashDates, setDashDates] = useState<string[]>([]);
  const [selectedDashDate, setSelectedDashDate] = useState<string>(() =>
    new Date().toLocaleDateString("en-CA")
  );

  // Fetch available dates for dashboard
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("created_at")
        .in("status", ["completed", "cancelled"])
        .order("created_at", { ascending: false });
      if (data) {
        const unique = [...new Set(data.map((o) =>
          new Date(o.created_at).toLocaleDateString("en-CA")
        ))];
        setDashDates(unique);
      }
    })();
  }, []);

  const fetchCompletedOrders = useCallback(async () => {
    const date = new Date(selectedDashDate);
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .in("status", ["completed", "cancelled"])
      .gte("created_at", date.toISOString())
      .lt("created_at", nextDay.toISOString())
      .order("created_at", { ascending: false });
    if (data) setCompletedOrders(data);
  }, [selectedDashDate]);

  useEffect(() => {
    fetchCompletedOrders();
    const isToday = selectedDashDate === new Date().toLocaleDateString("en-CA");
    if (isToday) {
      const interval = setInterval(fetchCompletedOrders, POLL_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [fetchCompletedOrders, selectedDashDate]);

  const fetchOrders = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .in("status", ["pending", "preparing", "ready"])
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: true });

    if (data) {
      const newIds = new Set(data.map((o) => o.id));
      const prevIds = prevOrderIdsRef.current;

      for (const id of newIds) {
        if (!prevIds.has(id)) {
          const order = data.find((o) => o.id === id);
          if (order?.status === "pending") {
            playChime();
            break;
          }
        }
      }

      prevOrderIdsRef.current = newIds;
      setOrders(data);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const fetchMenuItems = useCallback(async () => {
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .order("sort_order");
    if (data) setMenuItems(data);
  }, []);

  const fetchIngredients = useCallback(async () => {
    const { data } = await supabase
      .from("ingredients")
      .select("*")
      .order("name");
    if (data) setIngredients(data);
  }, []);

  useEffect(() => {
    fetchMenuItems();
    fetchIngredients();
  }, [fetchMenuItems, fetchIngredients]);


  const { espressoCount, matchaCount } = useMemo(() => {
    let espresso = 0;
    let matcha = 0;
    for (const order of orders) {
      for (const oi of order.order_items ?? []) {
        const cls = classifyItem(oi.item_name);
        if (cls.espresso) espresso += oi.quantity;
        if (cls.matcha) matcha += oi.quantity;
      }
    }
    return { espressoCount: espresso, matchaCount: matcha };
  }, [orders]);

  const playChime = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio not available
    }
  };

  const handleComplete = async (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    const { error } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", orderId);
    if (error) fetchOrders();
    fetchCompletedOrders();
  };

  const handleMarkUtangPaid = async (orderId: string) => {
    setCompletedOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, payment_method: "cash" as const } : o)
    );
    await supabase.from("orders").update({ payment_method: "cash" }).eq("id", orderId);
  };

  const handleDeleteOrder = async (orderId: string) => {
    setCompletedOrders((prev) => prev.filter((o) => o.id !== orderId));
    await supabase.from("order_items").delete().eq("order_id", orderId);
    await supabase.from("orders").delete().eq("id", orderId);
  };

  const handleAcceptPayment = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: "preparing" } : o
      )
    );
    const { error } = await supabase
      .from("orders")
      .update({ status: "preparing" })
      .eq("id", orderId);
    if (error) fetchOrders();
    // Fire-and-forget stock deduction
    if (order?.order_items) {
      deductStockForOrder(orderId, order.order_items);
    }
  };

  const handleCancel = async (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId);
    if (error) fetchOrders();
    fetchCompletedOrders();
  };

  const toggleGcash = () => {
    if (gcashShowing) {
      sendHideGcash();
      setGcashShowing(false);
    } else {
      sendShowGcash();
      setGcashShowing(true);
    }
  };

  // POS cart functions
  const addToPosCart = (item: MenuItem, modifiers: Modifier[] = []) => {
    const key = cartKey(item.id, modifiers);
    setPosCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing) {
        next.set(key, { ...existing, qty: existing.qty + 1 });
      } else {
        next.set(key, { key, item, qty: 1, modifiers });
      }
      return next;
    });
  };

  const decrementPosLine = (key: string) => {
    setPosCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing && existing.qty > 1) {
        next.set(key, { ...existing, qty: existing.qty - 1 });
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const posTotal = Array.from(posCart.values()).reduce((s, line) => s + lineUnitPrice(line) * line.qty, 0);
  const posTotalCost = Array.from(posCart.values()).reduce((s, line) => s + line.item.cost * line.qty, 0);

  const assignNextNumber = async (): Promise<number> => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("chip_number")
      .gte("created_at", today.toISOString())
      .not("chip_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = data?.[0]?.chip_number ?? 0;
    return (last % MAX_BLOCK) + 1;
  };

  const submitPosOrder = async (method: "cash" | "gcash" | "utang"): Promise<Order | null> => {
    if (posCart.size === 0) return null;
    const chipNumber = await assignNextNumber();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        total: posTotal,
        total_cost: posTotalCost,
        status: "preparing",
        chip_number: chipNumber,
        payment_method: method,
        customer_name: posCustomerName.trim() || null,
      })
      .select("*")
      .single();
    if (orderError || !order) return null;
    const items = Array.from(posCart.values()).map((line) => ({
      order_id: order.id,
      menu_item_id: line.item.id,
      item_name: line.item.name,
      item_price: lineUnitPrice(line),
      item_cost: line.item.cost,
      quantity: line.qty,
      modifiers: line.modifiers,
    }));
    const { data: insertedItems } = await supabase.from("order_items").insert(items).select();
    setPosCart(new Map());
    setPosCustomerName("");
    fetchOrders();
    if (insertedItems) {
      deductStockForOrder(order.id, insertedItems);
    }
    return order as Order;
  };

  const confirmOrders = orders.filter((o) => o.status === "pending");
  const makeOrders = orders.filter((o) => o.status !== "pending");

  const makeItemSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of makeOrders) {
      for (const oi of order.order_items ?? []) {
        counts.set(oi.item_name, (counts.get(oi.item_name) ?? 0) + oi.quantity);
      }
    }
    return Array.from(counts.entries()).map(([name, qty]) => ({ name, qty }));
  }, [makeOrders]);

  const dashStats = useMemo(() => {
    const completed = completedOrders.filter((o) => o.status === "completed");
    const revenue = completed.reduce((s, o) => s + o.total, 0);
    const cash = completed.filter((o) => o.payment_method === "cash").reduce((s, o) => s + o.total, 0);
    const gcash = completed.filter((o) => o.payment_method === "gcash").reduce((s, o) => s + o.total, 0);
    const utang = completed.filter((o) => o.payment_method === "utang").reduce((s, o) => s + o.total, 0);
    const totalCost = completed.reduce((s, o) => s + o.total_cost, 0);
    const cups = completed.reduce((s, o) => s + (o.order_items?.reduce((t, i) => t + i.quantity, 0) ?? 0), 0);
    return { revenue, cash, gcash, utang, totalCost, profit: revenue - totalCost, cups, count: completed.length };
  }, [completedOrders]);

  const updateMenuItem = async (id: string, updates: Partial<MenuItem>) => {
    const { error } = await supabase.from("menu_items").update(updates).eq("id", id);
    if (error) {
      console.error("updateMenuItem", error);
      window.alert(`Update failed: ${error.message}`);
      return;
    }
    setMenuItems((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));
  };

  const addMenuItem = async () => {
    const nextSort = menuItems.reduce((m, i) => Math.max(m, i.sort_order), -1) + 1;
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        name: "New item",
        category: "drink",
        price: 0,
        cost: 0,
        is_available: true,
        sort_order: nextSort,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("addMenuItem", error);
      window.alert(`Add failed: ${error?.message ?? "no data returned"}`);
      return;
    }
    setMenuItems((prev) => [...prev, data]);
  };

  const renameMenuGroup = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const { error } = await supabase
      .from("menu_items")
      .update({ display_group: trimmed })
      .eq("display_group", oldName);
    if (error) {
      window.alert(`Rename failed: ${error.message}`);
      return;
    }
    setMenuItems((prev) =>
      prev.map((m) => (m.display_group === oldName ? { ...m, display_group: trimmed } : m))
    );
  };

  const setGroupAvailability = async (name: string, isAvailable: boolean) => {
    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: isAvailable })
      .eq("display_group", name);
    if (error) {
      window.alert(`Toggle failed: ${error.message}`);
      return;
    }
    setMenuItems((prev) =>
      prev.map((m) => (m.display_group === name ? { ...m, is_available: isAvailable } : m))
    );
  };

  const deleteMenuGroup = async (name: string) => {
    const count = menuItems.filter((m) => m.display_group === name).length;
    if (!window.confirm(`Remove group "${name}"? ${count} item${count === 1 ? "" : "s"} will become ungrouped (items are NOT deleted).`)) return;
    const { error } = await supabase
      .from("menu_items")
      .update({ display_group: null })
      .eq("display_group", name);
    if (error) {
      window.alert(`Delete group failed: ${error.message}`);
      return;
    }
    setMenuItems((prev) =>
      prev.map((m) => (m.display_group === name ? { ...m, display_group: null } : m))
    );
  };

  const deleteMenuItem = async (id: string) => {
    const item = menuItems.find((m) => m.id === id);
    if (!item) return;
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) {
      console.error("deleteMenuItem", error);
      window.alert(
        `Cannot delete "${item.name}": ${error.message}\n\nIf this is a foreign-key error, the item has order history. Toggle availability off to hide it instead.`
      );
      return;
    }
    setMenuItems((prev) => prev.filter((m) => m.id !== id));
  };

  const reorderMenuItems = async (activeId: string, overId: string) => {
    setMenuItems((prev) => {
      const oldIndex = prev.findIndex((m) => m.id === activeId);
      const newIndex = prev.findIndex((m) => m.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      const changed: { id: string; sort_order: number }[] = [];
      for (let i = 0; i < next.length; i++) {
        if (next[i].sort_order !== i) {
          next[i] = { ...next[i], sort_order: i };
          changed.push({ id: next[i].id, sort_order: i });
        }
      }
      Promise.all(
        changed.map((c) =>
          supabase.from("menu_items").update({ sort_order: c.sort_order }).eq("id", c.id)
        )
      );
      return next;
    });
  };

  const pendingCount = confirmOrders.length;

  return (
    <div className="h-dvh overflow-hidden bg-slate-900 flex flex-col">
      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "orders" ? (
          <>
            {/* Orders Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-extrabold">Orders</h1>
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>
              <div className="flex items-center gap-4">
                {espressoCount > 0 && (
                  <div className="flex items-center gap-1.5 bg-amber-500/15 px-2.5 py-1 rounded-full">
                    <span className="text-base">☕</span>
                    <span className="text-sm font-bold text-amber-400">{espressoCount}</span>
                  </div>
                )}
                {matchaCount > 0 && (
                  <div className="flex items-center gap-1.5 bg-emerald-500/15 px-2.5 py-1 rounded-full">
                    <span className="text-base">🍵</span>
                    <span className="text-sm font-bold text-emerald-400">{matchaCount}</span>
                  </div>
                )}
                <span className="text-sm text-slate-500">
                  {orders.length} order{orders.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={toggleGcash}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                    gcashShowing
                      ? "bg-blue-500 text-white"
                      : "bg-blue-500/15 text-blue-400"
                  }`}
                >
                  {gcashShowing ? "Hide QR" : "Show QR"}
                </button>
              </div>
            </div>

            {/* Two-panel layout */}
            <div className="flex-1 overflow-hidden grid grid-rows-2 landscape:grid-rows-1 landscape:grid-cols-2 divide-y landscape:divide-y-0 landscape:divide-x divide-slate-700">
              {/* Confirm */}
              <div className="flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/50 shrink-0">
                  <span className="text-xs font-bold text-amber-400">Confirm ({confirmOrders.length})</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {confirmOrders.length === 0 && (
                    <div className="flex items-center justify-center h-24 text-slate-600 text-xs">
                      No orders to confirm
                    </div>
                  )}
                  {confirmOrders.map((order, i) => (
                    <QueueCard
                      key={order.id}
                      order={order}
                      position={i}
                      onPaid={(id) => {
                        if (order.payment_method === "cash") {
                          setCashModalOrder(order);
                        } else {
                          handleAcceptPayment(id);
                        }
                      }}
                      onCancel={handleCancel}

                    />
                  ))}
                </div>
              </div>

              {/* Make */}
              <div className="flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/50 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-400">Make ({makeOrders.length})</span>
                  </div>
                  {makeItemSummary.length > 0 && (
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                      {makeItemSummary.map(({ name, qty }) => (
                        <span key={name} className="text-xs text-slate-300">
                          {qty > 1 && <span className="font-bold text-slate-100">{qty}x </span>}
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {makeOrders.length === 0 && (
                    <div className="flex items-center justify-center h-24 text-slate-600 text-xs">
                      No orders to make
                    </div>
                  )}
                  {makeOrders.map((order, i) => (
                    <QueueCard
                      key={order.id}
                      order={order}
                      position={i}
                      onDone={handleComplete}
                      onCancel={handleCancel}

                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : tab === "pos" ? (
          /* POS Tab */
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* POS Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
              <h1 className="text-lg font-extrabold">POS</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePosView}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                    posView === "combined"
                      ? "bg-purple-500/20 text-purple-300"
                      : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {posView === "combined" ? "Combined" : "Separate"}
                </button>
                <button
                  onClick={toggleGcash}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                    gcashShowing
                      ? "bg-blue-500 text-white"
                      : "bg-blue-500/15 text-blue-400"
                  }`}
                >
                  {gcashShowing ? "Hide QR" : "Show QR"}
                </button>
              </div>
            </div>

            {/* Menu grid */}
            <div className="flex-1 overflow-y-auto p-3">
              {posView === "separate" ? (
                <div className="grid grid-cols-3 gap-2">
                  {menuItems.filter((m) => m.is_available).map((item) => {
                    const totalQty = Array.from(posCart.values())
                      .filter((l) => l.item.id === item.id)
                      .reduce((s, l) => s + l.qty, 0);
                    return (
                      <button
                        key={item.id}
                        onClick={() => setPosPicker({
                          name: item.name,
                          image: item.image_url ?? "",
                          color: "",
                          price: item.price,
                          variants: [{ label: "", menuItem: item }],
                        })}
                        className="relative flex flex-col items-center gap-1 p-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors active:scale-95"
                      >
                        {totalQty > 0 && (
                          <span className="absolute top-1.5 right-1.5 min-w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold px-1">
                            {totalQty}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-slate-200 text-center leading-tight">
                          {item.name}
                        </span>
                        <span className="text-xs text-slate-400">{formatCurrency(item.price)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {posDisplayMenu.map((drink) => {
                    const variantIds = new Set(drink.variants.map((v) => v.menuItem.id));
                    const totalQty = Array.from(posCart.values())
                      .filter((l) => variantIds.has(l.item.id))
                      .reduce((s, l) => s + l.qty, 0);
                    return (
                      <button
                        key={drink.name + drink.variants[0].menuItem.id}
                        onClick={() => setPosPicker(drink)}
                        className="relative flex flex-col items-center gap-1 p-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors active:scale-95"
                      >
                        {totalQty > 0 && (
                          <span className="absolute top-1.5 right-1.5 min-w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold px-1">
                            {totalQty}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-slate-200 text-center leading-tight">
                          {drink.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatCurrency(drink.price)}
                          {drink.variants.length > 1 && (
                            <span className="ml-1 text-slate-500">· {drink.variants.length}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {posPicker && (
              <ItemPickerModal
                drink={posPicker}
                onAdd={(menuItem, modifiers) => addToPosCart(menuItem, modifiers)}
                onClose={() => setPosPicker(null)}
              />
            )}

            {/* POS Cart */}
            {posCart.size > 0 && (
              <div className="shrink-0 border-t border-slate-700 bg-slate-800 px-4 py-3">
                <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
                  {Array.from(posCart.values()).map((line) => (
                    <div key={line.key} className="flex items-start justify-between text-sm gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <button
                          onClick={() => decrementPosLine(line.key)}
                          className="w-6 h-6 mt-0.5 shrink-0 rounded bg-slate-700 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center text-xs font-bold transition-colors"
                        >
                          -
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-300">
                            <span className="text-slate-500 mr-1">{line.qty}x</span>
                            {line.item.name}
                          </div>
                          {line.modifiers.length > 0 && (
                            <div className="text-[10px] text-emerald-400 mt-0.5 leading-tight">
                              {line.modifiers.map((m) => `+ ${m.name}`).join(" · ")}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-slate-400 shrink-0">{formatCurrency(lineUnitPrice(line) * line.qty)}</span>
                    </div>
                  ))}
                </div>
                <input
                  type="text"
                  value={posCustomerName}
                  onChange={(e) => setPosCustomerName(e.target.value)}
                  placeholder="Name (optional)"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white mb-2 placeholder:text-slate-500"
                />
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-white mr-auto">{formatCurrency(posTotal)}</span>
                  <button
                    onClick={() => { setPosCart(new Map()); setPosCustomerName(""); }}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-red-400 border border-red-400/30 hover:bg-red-500/15 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setCashCalculatorOpen(true)}
                    className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-bold hover:bg-emerald-500/30 transition-colors"
                  >
                    Cash
                  </button>
                  <button
                    onClick={() => submitPosOrder("gcash")}
                    className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-sm font-bold hover:bg-blue-500/30 transition-colors"
                  >
                    GCash
                  </button>
                  <button
                    onClick={() => submitPosOrder("utang")}
                    className="px-4 py-2 rounded-lg bg-orange-500/20 text-orange-400 text-sm font-bold hover:bg-orange-500/30 transition-colors"
                  >
                    Utang
                  </button>
                </div>
              </div>
            )}

            {cashCalculatorOpen && (
              <CashChangeModal
                total={posTotal}
                onConfirm={async (tendered) => {
                  const saved = await submitPosOrder("cash");
                  setCashCalculatorOpen(false);
                  if (saved) {
                    setCashTendered(tendered);
                    setCashModalOrder(saved);
                  }
                }}
                onClose={() => setCashCalculatorOpen(false)}
              />
            )}
          </div>
        ) : tab === "dashboard" ? (
          showMenu ? (
            /* Menu (Settings) view */
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
                <h1 className="text-lg font-extrabold">Menu</h1>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      sendMenuRefresh();
                      setPushedAt(Date.now());
                      setTimeout(() => setPushedAt(null), 1500);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-300 bg-blue-500/15 hover:bg-blue-500/25 transition-colors"
                  >
                    {pushedAt ? "Pushed ✓" : "Push to Kiosk"}
                  </button>
                  <button
                    onClick={addMenuItem}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 transition-colors"
                  >
                    + New
                  </button>
                  <button
                    onClick={() => setShowMenu(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 border border-slate-600 hover:bg-slate-700 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SortableMenuList
                  menuItems={menuItems}
                  ingredients={ingredients}
                  onUpdate={updateMenuItem}
                  onReorder={reorderMenuItems}
                  onDelete={deleteMenuItem}
                  onRenameGroup={renameMenuGroup}
                  onDeleteGroup={deleteMenuGroup}
                  onSetGroupAvailability={setGroupAvailability}
                />
                {menuItems.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
                    No menu items
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Dashboard view */
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
                <select
                  value={selectedDashDate}
                  onChange={(e) => setSelectedDashDate(e.target.value)}
                  className="bg-transparent text-lg font-extrabold text-white border-none outline-none"
                >
                  {dashDates.map((d) => (
                    <option key={d} value={d} className="bg-slate-800">
                      {d === new Date().toLocaleDateString("en-CA")
                        ? "Today"
                        : new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowMenu(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 border border-slate-600 hover:bg-slate-700 transition-colors"
                >
                  Menu
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800 rounded-xl p-2.5 border border-slate-700">
                    <div className="text-[10px] text-slate-400">Revenue</div>
                    <div className="text-lg font-extrabold text-white">{formatCurrency(dashStats.revenue)}</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-2.5 border border-slate-700">
                    <div className="text-[10px] text-emerald-400">Profit</div>
                    <div className="text-lg font-extrabold text-emerald-300">{formatCurrency(dashStats.profit)}</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-2.5 border border-slate-700">
                    <div className="text-[10px] text-slate-400">Cups</div>
                    <div className="text-lg font-extrabold text-white">{dashStats.cups}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800 rounded-xl p-2 border border-slate-700">
                    <div className="text-[10px] text-emerald-400">Cash</div>
                    <div className="text-sm font-bold text-emerald-300">{formatCurrency(dashStats.cash)}</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-2 border border-slate-700">
                    <div className="text-[10px] text-blue-400">GCash</div>
                    <div className="text-sm font-bold text-blue-300">{formatCurrency(dashStats.gcash)}</div>
                  </div>
                  <div className="bg-slate-800 rounded-xl p-2 border border-slate-700">
                    <div className="text-[10px] text-orange-400">Utang</div>
                    <div className="text-sm font-bold text-orange-300">{formatCurrency(dashStats.utang)}</div>
                  </div>
                </div>

                {/* Completed orders — swipeable */}
                <div className="text-xs font-bold text-slate-400 pt-1">
                  Orders ({completedOrders.length})
                </div>
                {completedOrders.length === 0 && (
                  <div className="text-xs text-slate-600 text-center py-4">No orders</div>
                )}
                <div className="space-y-1.5">
                  {completedOrders.map((order) => (
                    <SwipeableOrderRow
                      key={order.id}
                      order={order}
                      onDelete={handleDeleteOrder}
                      onMarkPaid={order.payment_method === "utang" ? handleMarkUtangPaid : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        ) : (
          /* Costs Tab */
          <CostsTab />
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="shrink-0 border-t border-slate-700 bg-slate-800 flex">
        <button
          onClick={() => setTab("orders")}
          className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors ${
            tab === "orders" ? "text-white" : "text-slate-500"
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-xs font-bold">Orders</span>
          {pendingCount > 0 && tab !== "orders" && (
            <span className="absolute top-1 right-1/4 min-w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("pos")}
          className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors ${
            tab === "pos" ? "text-white" : "text-slate-500"
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <span className="text-xs font-bold">POS</span>
        </button>
        <button
          onClick={() => { setTab("dashboard"); setShowMenu(false); }}
          className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors ${
            tab === "dashboard" ? "text-white" : "text-slate-500"
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <span className="text-xs font-bold">Dashboard</span>
        </button>
        <button
          onClick={() => setTab("costs")}
          className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors ${
            tab === "costs" ? "text-white" : "text-slate-500"
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-xs font-bold">Costs</span>
        </button>
      </div>

      {cashModalOrder && (
        <CashReceiptModal
          order={cashModalOrder}
          cashTendered={cashTendered}
          onClose={() => {
            setCashModalOrder(null);
            setCashTendered(0);
          }}
        />
      )}
    </div>
  );
}

function QueueCard({
  order,
  position,
  onPaid,
  onDone,
  onCancel,
}: {
  order: Order;
  position: number;
  onPaid?: (id: string) => void;
  onDone?: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [elapsed, setElapsed] = useState("");
  const isPending = order.status === "pending";

  useEffect(() => {
    const update = () => {
      const diff = Math.floor(
        (Date.now() - new Date(order.created_at).getTime()) / 1000
      );
      const mins = Math.floor(diff / 60);
      setElapsed(mins > 0 ? `${mins}m` : "<1m");
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [order.created_at]);

  const cardStyle =
    position === 0
      ? "bg-indigo-500/15 border-indigo-400/50 ring-1 ring-indigo-400/30"
      : position === 1
      ? "bg-indigo-500/5 border-indigo-400/20"
      : "bg-slate-800 border-slate-700/60";

  return (
    <div className={`rounded-xl px-3 py-2.5 border ${cardStyle}`}>
      {position <= 1 && (
        <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
          position === 0 ? "text-indigo-300" : "text-indigo-400/50"
        }`}>
          {position === 0 ? "Now" : "Next"}
        </div>
      )}
      {order.customer_name && (
        <div className="text-base font-extrabold text-white truncate mb-1.5">
          {order.customer_name}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
          position === 0 ? "bg-white" : "bg-slate-600"
        }`}>
          <span className={`text-2xl font-extrabold ${position === 0 ? "text-black" : "text-white"}`}>
            {order.chip_number ?? "?"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          {isPending && (
            <span className="text-xs text-slate-400 block mb-0.5">Give block</span>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-xs font-semibold ${
              order.payment_method === "gcash" ? "text-blue-400" : order.payment_method === "utang" ? "text-orange-400" : "text-emerald-500"
            }`}>
              {order.payment_method === "gcash" ? "GCash" : order.payment_method === "utang" ? "Utang" : "Cash"}
            </span>
            <span className="text-xs text-slate-500">{formatCurrency(order.total)}</span>
            <span className="text-xs text-slate-600">{elapsed}</span>
          </div>
        </div>
        <button
          onClick={() => onCancel(order.id)}
          className="px-2.5 py-1 rounded-lg text-xs font-bold text-red-400 border border-red-400/40 hover:bg-red-500/15 transition-colors shrink-0"
        >
          Cancel
        </button>
      </div>

      <div className="mt-2 space-y-1">
        {(order.order_items ?? []).map((oi) => {
          const isIced = /^iced /i.test(oi.item_name);
          const isHot = /^hot /i.test(oi.item_name);
          return (
            <div key={oi.id} className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                {oi.quantity > 1 && <span className="text-slate-400 text-base font-semibold">{oi.quantity}x</span>}
                {isIced && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                    <Snowflake size={14} weight="fill" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wide">Ice</span>
                  </span>
                )}
                {isHot && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                    <Fire size={14} weight="fill" />
                    <span className="text-[10px] font-extrabold uppercase tracking-wide">Hot</span>
                  </span>
                )}
                <span className={`text-base font-semibold leading-tight ${isPending ? "text-slate-100" : "text-slate-300"}`}>
                  {oi.item_name.replace(/^(Iced|Hot)\s+/i, "")}
                </span>
              </div>
              <span className="text-xs text-slate-500 shrink-0">
                {formatCurrency(oi.item_price * oi.quantity)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-slate-700/50 flex justify-between">
        <span className="text-xs font-bold text-slate-400">Total</span>
        <span className="text-sm font-bold text-slate-200">{formatCurrency(order.total)}</span>
      </div>

      {onPaid && isPending && (
        <button
          onClick={() => onPaid(order.id)}
          className="mt-2 w-full py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold text-sm transition-colors"
        >
          Paid
        </button>
      )}
      {onDone && !isPending && (
        <button
          onClick={() => onDone(order.id)}
          className="mt-2 w-full py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-bold text-sm transition-colors"
        >
          Done
        </button>
      )}
    </div>
  );
}

type GroupStatus = "all" | "none" | "mixed";

function SortableMenuList({
  menuItems,
  ingredients,
  onUpdate,
  onReorder,
  onDelete,
  onRenameGroup,
  onDeleteGroup,
  onSetGroupAvailability,
}: {
  menuItems: MenuItem[];
  ingredients: Ingredient[];
  onUpdate: (id: string, updates: Partial<MenuItem>) => void;
  onReorder: (activeId: string, overId: string) => void;
  onDelete: (id: string) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
  onDeleteGroup: (name: string) => void;
  onSetGroupAvailability: (name: string, isAvailable: boolean) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  const allGroups = Array.from(
    new Set(menuItems.map((m) => m.display_group).filter((g): g is string => !!g))
  ).sort();

  const groupStatus = new Map<string, GroupStatus>();
  const groupCoverItemId = new Map<string, string>();
  for (const g of allGroups) {
    const members = menuItems.filter((m) => m.display_group === g);
    const available = members.filter((m) => m.is_available).length;
    groupStatus.set(g, available === 0 ? "none" : available === members.length ? "all" : "mixed");
    const cover = [...members]
      .sort((a, b) => a.sort_order - b.sort_order)
      .find((m) => m.image_url);
    if (cover) groupCoverItemId.set(g, cover.id);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={menuItems.map((m) => m.id)} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-slate-700/50">
          {menuItems.map((item) => (
            <MenuItemRow
              key={item.id}
              item={item}
              ingredients={ingredients}
              allGroups={allGroups}
              groupStatus={item.display_group ? groupStatus.get(item.display_group) ?? null : null}
              isGroupCover={item.display_group ? groupCoverItemId.get(item.display_group) === item.id : false}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onRenameGroup={onRenameGroup}
              onDeleteGroup={onDeleteGroup}
              onSetGroupAvailability={onSetGroupAvailability}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function MenuItemRow({ item, ingredients, allGroups, groupStatus, isGroupCover, onUpdate, onDelete, onRenameGroup, onDeleteGroup, onSetGroupAvailability }: { item: MenuItem; ingredients: Ingredient[]; allGroups: string[]; groupStatus: GroupStatus | null; isGroupCover: boolean; onUpdate: (id: string, updates: Partial<MenuItem>) => void; onDelete: (id: string) => void; onRenameGroup: (oldName: string, newName: string) => void; onDeleteGroup: (name: string) => void; onSetGroupAvailability: (name: string, isAvailable: boolean) => void }) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));
  const [cost, setCost] = useState(String(item.cost));
  const [label, setLabel] = useState(item.display_label ?? "");
  const [expanded, setExpanded] = useState(false);
  const [recipe, setRecipe] = useState<MenuItemIngredient[]>([]);
  const [loadedRecipe, setLoadedRecipe] = useState(false);
  const [addingId, setAddingId] = useState("");
  const [addingQty, setAddingQty] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== item.name) onUpdate(item.id, { name: trimmed });
    else setName(item.name);
  };

  const saveLabel = () => {
    const trimmed = label.trim();
    const next = trimmed || null;
    if (next !== item.display_label) onUpdate(item.id, { display_label: next });
  };

  const changeGroup = (value: string) => {
    if (value === "__new__") {
      const entered = window.prompt("New group name?", "")?.trim();
      if (!entered) return;
      onUpdate(item.id, { display_group: entered });
    } else if (value === "__none__") {
      onUpdate(item.id, { display_group: null });
    } else {
      onUpdate(item.id, { display_group: value });
    }
  };

  const savePrice = () => {
    const val = parseFloat(price);
    if (!isNaN(val) && val !== item.price) onUpdate(item.id, { price: val });
    else setPrice(String(item.price));
  };

  const saveCost = () => {
    const val = parseFloat(cost);
    if (!isNaN(val) && val !== item.cost) onUpdate(item.id, { cost: val });
    else setCost(String(item.cost));
  };

  const loadRecipe = async () => {
    if (loadedRecipe) return;
    const { data } = await supabase
      .from("menu_item_ingredients")
      .select("*, ingredient:ingredients(*)")
      .eq("menu_item_id", item.id);
    if (data) setRecipe(data);
    setLoadedRecipe(true);
  };

  const toggleExpand = () => {
    if (!expanded) loadRecipe();
    setExpanded(!expanded);
  };

  const recipeCost = recipe.reduce((sum, r) => {
    const ing = r.ingredient;
    return sum + (ing ? ing.cost_per_unit * r.quantity : 0);
  }, 0);

  const addIngredient = async () => {
    if (!addingId || !addingQty) return;
    const qty = parseFloat(addingQty);
    if (isNaN(qty) || qty <= 0) return;
    const { data } = await supabase
      .from("menu_item_ingredients")
      .insert({ menu_item_id: item.id, ingredient_id: addingId, quantity: qty })
      .select("*, ingredient:ingredients(*)")
      .single();
    if (data) setRecipe((prev) => [...prev, data]);
    setAddingId("");
    setAddingQty("");
  };

  const removeIngredient = async (id: string) => {
    await supabase.from("menu_item_ingredients").delete().eq("id", id);
    setRecipe((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRecipeQty = async (id: string, qty: number) => {
    await supabase.from("menu_item_ingredients").update({ quantity: qty }).eq("id", id);
    setRecipe((prev) => prev.map((r) => r.id === id ? { ...r, quantity: qty } : r));
  };

  const syncCost = () => {
    const rounded = Math.round(recipeCost * 100) / 100;
    setCost(String(rounded));
    onUpdate(item.id, { cost: rounded });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${!item.is_available ? "opacity-40" : ""} ${isDragging ? "opacity-50 bg-slate-800 relative z-10" : ""}`}
    >
      <div className="px-3 py-3 flex items-start gap-2">
        <button
          onClick={() => setShowPicker(true)}
          title={isGroupCover ? "This image represents the group" : undefined}
          className={`relative w-12 h-12 rounded-lg overflow-hidden bg-slate-700 border shrink-0 flex items-center justify-center ${
            isGroupCover ? "border-emerald-400 ring-1 ring-emerald-400/40" : "border-slate-600"
          }`}
        >
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="text-xl text-slate-500">+</span>
          )}
          {isGroupCover && (
            <span className="absolute bottom-0 inset-x-0 bg-emerald-500/90 text-[8px] font-bold text-white text-center leading-none py-0.5">
              COVER
            </span>
          )}
        </button>
        <div className="flex-1 min-w-0 space-y-1.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm font-bold text-white"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500">₱</span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={savePrice}
                className="w-16 bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-white font-semibold text-right"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500">cost</span>
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                onBlur={saveCost}
                className="w-16 bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-slate-400 font-semibold text-right"
              />
            </div>
            <button
              onClick={() => onDelete(item.id)}
              aria-label="Delete"
              className="ml-auto w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:bg-red-500/15 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 4h11" />
                <path d="M6 4V2.5h4V4" />
                <path d="M3.5 4l.7 9.2a1.3 1.3 0 0 0 1.3 1.3h5a1.3 1.3 0 0 0 1.3-1.3L12.5 4" />
              </svg>
            </button>
            <button
              onClick={toggleExpand}
              className="text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              Recipe {expanded ? "▲" : "▼"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 shrink-0">Group</span>
            <select
              value={item.display_group ?? "__none__"}
              onChange={(e) => changeGroup(e.target.value)}
              className="flex-1 min-w-0 bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-white"
            >
              <option value="__none__">(none)</option>
              {allGroups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
              {item.display_group && !allGroups.includes(item.display_group) && (
                <option value={item.display_group}>{item.display_group}</option>
              )}
              <option value="__new__">+ New group…</option>
            </select>
            {item.display_group && (
              <>
                <button
                  onClick={() => onSetGroupAvailability(item.display_group!, groupStatus !== "all")}
                  aria-label={groupStatus === "all" ? "Hide group" : "Show group"}
                  title={
                    groupStatus === "all"
                      ? "Visible — tap to hide"
                      : groupStatus === "none"
                      ? "Hidden — tap to show"
                      : "Mixed — tap to show all"
                  }
                  className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-700 transition-colors shrink-0 ${
                    groupStatus === "all"
                      ? "text-emerald-400"
                      : groupStatus === "none"
                      ? "text-slate-600"
                      : "text-amber-400"
                  }`}
                >
                  {groupStatus === "none" ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 8s2.5-4.5 6-4.5 6 4.5 6 4.5-2.5 4.5-6 4.5S2 8 2 8z" />
                      <circle cx="8" cy="8" r="1.5" />
                      <line x1="2" y1="14" x2="14" y2="2" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 8s2.5-4.5 6-4.5 6 4.5 6 4.5-2.5 4.5-6 4.5S2 8 2 8z" />
                      <circle cx="8" cy="8" r="2" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => {
                    const entered = window.prompt(`Rename group "${item.display_group}" to:`, item.display_group ?? "")?.trim();
                    if (entered && entered !== item.display_group) onRenameGroup(item.display_group!, entered);
                  }}
                  aria-label="Rename group"
                  className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 2l3 3-8.5 8.5L2 14l.5-3.5L11 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDeleteGroup(item.display_group!)}
                  aria-label="Delete group"
                  className="w-6 h-6 flex items-center justify-center rounded-md text-red-400 hover:bg-red-500/15 transition-colors shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 4h11" />
                    <path d="M6 4V2.5h4V4" />
                    <path d="M3.5 4l.7 9.2a1.3 1.3 0 0 0 1.3 1.3h5a1.3 1.3 0 0 0 1.3-1.3L12.5 4" />
                  </svg>
                </button>
              </>
            )}
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={saveLabel}
              placeholder="Hot / Iced"
              className="w-20 bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-white"
            />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <button
            onClick={() => onUpdate(item.id, { is_available: !item.is_available })}
            className={`w-12 h-7 rounded-full relative transition-colors ${
              item.is_available ? "bg-emerald-500" : "bg-slate-600"
            }`}
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
              item.is_available ? "right-1" : "left-1"
            }`} />
          </button>
          <button
            {...attributes}
            {...listeners}
            aria-label="Reorder"
            className="w-12 h-7 flex items-center justify-center text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing touch-none"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="4" r="1.4" />
              <circle cx="5" cy="8" r="1.4" />
              <circle cx="5" cy="12" r="1.4" />
              <circle cx="11" cy="4" r="1.4" />
              <circle cx="11" cy="8" r="1.4" />
              <circle cx="11" cy="12" r="1.4" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          <div className="bg-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Recipe</span>
              {recipe.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    Total: <span className="font-bold text-emerald-400">{formatCurrency(recipeCost)}</span>
                  </span>
                  {Math.abs(recipeCost - item.cost) > 0.01 && (
                    <button
                      onClick={syncCost}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                    >
                      Sync cost
                    </button>
                  )}
                </div>
              )}
            </div>

            {recipe.length === 0 && loadedRecipe && (
              <div className="text-xs text-slate-600">No ingredients added</div>
            )}

            {recipe.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => removeIngredient(r.id)}
                  className="w-5 h-5 rounded bg-slate-700 hover:bg-red-500/20 text-slate-500 hover:text-red-400 flex items-center justify-center text-xs transition-colors"
                >
                  ×
                </button>
                <span className="text-slate-300 flex-1">{r.ingredient?.name ?? "?"}</span>
                <input
                  type="number"
                  defaultValue={r.quantity}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0 && val !== r.quantity) updateRecipeQty(r.id, val);
                  }}
                  className="w-16 bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white text-right"
                />
                <span className="text-[10px] text-slate-500 w-6">{r.ingredient?.unit}</span>
                <span className="text-xs text-slate-500 w-14 text-right">
                  {r.ingredient ? formatCurrency(r.ingredient.cost_per_unit * r.quantity) : "—"}
                </span>
              </div>
            ))}

            {/* Add ingredient */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
              <select
                value={addingId}
                onChange={(e) => setAddingId(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-white"
              >
                <option value="">+ Add ingredient</option>
                {ingredients
                  .filter((i) => !recipe.some((r) => r.ingredient_id === i.id))
                  .map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
              </select>
              <input
                type="number"
                value={addingQty}
                onChange={(e) => setAddingQty(e.target.value)}
                placeholder="qty"
                className="w-16 bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-white text-right"
              />
              <button
                onClick={addIngredient}
                disabled={!addingId || !addingQty}
                className="px-2 py-1 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-30 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showPicker && (
        <ImagePickerModal
          currentUrl={item.image_url}
          onPick={(url) => onUpdate(item.id, { image_url: url })}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function SwipeableOrderRow({
  order,
  onDelete,
  onMarkPaid,
}: {
  order: Order;
  onDelete: (id: string) => void;
  onMarkPaid?: (id: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swipingRef = useRef(false);
  const isCancelled = order.status === "cancelled";
  const isUtang = !!onMarkPaid;
  const threshold = isUtang ? 140 : 70;

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    swipingRef.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipingRef.current || !rowRef.current) return;
    const diff = e.touches[0].clientX - startX.current;
    currentX.current = Math.min(0, diff);
    rowRef.current.style.transform = `translateX(${currentX.current}px)`;
    rowRef.current.style.transition = "none";
  };

  const handleTouchEnd = () => {
    if (!swipingRef.current || !rowRef.current) return;
    swipingRef.current = false;
    rowRef.current.style.transition = "transform 0.2s ease-out";
    if (currentX.current < -threshold / 2) {
      rowRef.current.style.transform = `translateX(-${threshold}px)`;
    } else {
      rowRef.current.style.transform = "translateX(0)";
    }
  };

  const resetSwipe = () => {
    if (rowRef.current) {
      rowRef.current.style.transition = "transform 0.2s ease-out";
      rowRef.current.style.transform = "translateX(0)";
    }
  };

  const time = new Date(order.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  const itemNames = (order.order_items ?? []).map((oi) => `${oi.quantity > 1 ? oi.quantity + "x " : ""}${oi.item_name}`).join(", ");

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Action buttons revealed by swipe */}
      <div className={`absolute inset-y-0 right-0 flex ${isUtang ? "w-[140px]" : "w-[70px]"}`}>
        {isUtang && (
          <button
            onClick={() => { resetSwipe(); onMarkPaid!(order.id); }}
            className="w-[70px] bg-emerald-500 text-white text-xs font-bold flex items-center justify-center"
          >
            Paid
          </button>
        )}
        <button
          onClick={() => { resetSwipe(); onDelete(order.id); }}
          className="w-[70px] bg-red-500 text-white text-xs font-bold flex items-center justify-center"
        >
          Delete
        </button>
      </div>
      {/* Foreground row */}
      <div
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative bg-slate-800 px-3 py-2 z-10"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isCancelled ? (
              <span className="text-xs font-bold text-red-400">X</span>
            ) : (
              <span className={`text-xs font-bold ${
                order.payment_method === "gcash" ? "text-blue-400" : order.payment_method === "utang" ? "text-orange-400" : "text-emerald-400"
              }`}>
                {order.payment_method === "gcash" ? "G" : order.payment_method === "utang" ? "U" : "C"}
              </span>
            )}
            <span className={`text-sm truncate ${isCancelled ? "text-slate-500 line-through" : "text-slate-300"}`}>{itemNames}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isCancelled && (
              <span className="text-[10px] font-bold text-red-400/60">Cancelled</span>
            )}
            <span className={`text-sm font-bold ${isCancelled ? "text-slate-500" : "text-slate-200"}`}>{formatCurrency(order.total)}</span>
            <span className="text-[10px] text-slate-500">{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

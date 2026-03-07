"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Order, MenuItem } from "@/lib/types";
import { formatCurrency, getShortName } from "@/lib/utils";
import { sendShowGcash, sendHideGcash } from "@/lib/kiosk-channel";

const POLL_INTERVAL = 3000;

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
  const [tab, setTab] = useState<"orders" | "pos" | "sales">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const prevOrderIdsRef = useRef<Set<string>>(new Set());
  const [gcashShowing, setGcashShowing] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [posCart, setPosCart] = useState<Map<string, { item: MenuItem; qty: number }>>(new Map());
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);

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

  useEffect(() => {
    supabase
      .from("menu_items")
      .select("*")
      .eq("is_available", true)
      .order("sort_order")
      .then(({ data }) => { if (data) setMenuItems(data); });
  }, []);

  const fetchCompletedOrders = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .in("status", ["completed", "cancelled"])
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false });
    if (data) setCompletedOrders(data);
  }, []);

  useEffect(() => {
    fetchCompletedOrders();
    const interval = setInterval(fetchCompletedOrders, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchCompletedOrders]);

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

  const handleAcceptPayment = async (orderId: string) => {
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
  const addToPosCart = (item: MenuItem) => {
    setPosCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      if (existing) {
        next.set(item.id, { ...existing, qty: existing.qty + 1 });
      } else {
        next.set(item.id, { item, qty: 1 });
      }
      return next;
    });
  };

  const removePosItem = (itemId: string) => {
    setPosCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (existing && existing.qty > 1) {
        next.set(itemId, { ...existing, qty: existing.qty - 1 });
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  const posTotal = Array.from(posCart.values()).reduce((s, { item, qty }) => s + item.price * qty, 0);

  const submitPosOrder = async (method: "cash" | "gcash" | "utang") => {
    if (posCart.size === 0) return;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        total: posTotal,
        total_cost: 0,
        status: "preparing",
        chip_number: null,
        payment_method: method,
      })
      .select("id")
      .single();
    if (orderError || !order) return;
    const items = Array.from(posCart.values()).map(({ item, qty }) => ({
      order_id: order.id,
      menu_item_id: item.id,
      item_name: item.name,
      item_price: item.price,
      item_cost: 0,
      quantity: qty,
    }));
    await supabase.from("order_items").insert(items);
    setPosCart(new Map());
    fetchOrders();
  };

  const handleDeleteOrder = async () => {
    if (!deleteOrderId) return;
    setCompletedOrders((prev) => prev.filter((o) => o.id !== deleteOrderId));
    await supabase.from("order_items").delete().eq("order_id", deleteOrderId);
    await supabase.from("orders").delete().eq("id", deleteOrderId);
    setDeleteOrderId(null);
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

  const salesSummary = useMemo(() => {
    const completed = completedOrders.filter((o) => o.status === "completed");
    const cancelled = completedOrders.filter((o) => o.status === "cancelled");
    const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
    const cashRevenue = completed.filter((o) => o.payment_method === "cash").reduce((s, o) => s + o.total, 0);
    const gcashRevenue = completed.filter((o) => o.payment_method === "gcash").reduce((s, o) => s + o.total, 0);
    const utangRevenue = completed.filter((o) => o.payment_method === "utang").reduce((s, o) => s + o.total, 0);

    const itemCounts = new Map<string, { qty: number; revenue: number }>();
    for (const order of completed) {
      for (const oi of order.order_items ?? []) {
        const existing = itemCounts.get(oi.item_name) ?? { qty: 0, revenue: 0 };
        itemCounts.set(oi.item_name, {
          qty: existing.qty + oi.quantity,
          revenue: existing.revenue + oi.item_price * oi.quantity,
        });
      }
    }
    const topItems = Array.from(itemCounts.entries())
      .map(([name, { qty, revenue }]) => ({ name, qty, revenue }))
      .sort((a, b) => b.qty - a.qty);

    return {
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      totalRevenue,
      cashRevenue,
      gcashRevenue,
      utangRevenue,
      topItems,
    };
  }, [completedOrders]);

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
                      onPaid={handleAcceptPayment}
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

            {/* Menu grid */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-3 gap-2">
                {menuItems.map((item) => {
                  const inCart = posCart.get(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => addToPosCart(item)}
                      className="relative flex flex-col items-center gap-1 p-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors active:scale-95"
                    >
                      {inCart && (
                        <span className="absolute top-1.5 right-1.5 min-w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold px-1">
                          {inCart.qty}
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
            </div>

            {/* POS Cart */}
            {posCart.size > 0 && (
              <div className="shrink-0 border-t border-slate-700 bg-slate-800 px-4 py-3">
                <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
                  {Array.from(posCart.values()).map(({ item, qty }) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => removePosItem(item.id)}
                          className="w-6 h-6 rounded bg-slate-700 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center text-xs font-bold transition-colors"
                        >
                          -
                        </button>
                        <span className="text-slate-300">
                          <span className="text-slate-500 mr-1">{qty}x</span>
                          {item.name}
                        </span>
                      </div>
                      <span className="text-slate-400">{formatCurrency(item.price * qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-white mr-auto">{formatCurrency(posTotal)}</span>
                  <button
                    onClick={() => setPosCart(new Map())}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-red-400 border border-red-400/30 hover:bg-red-500/15 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => submitPosOrder("cash")}
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
          </div>
        ) : (
          /* Sales Tab */
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
              <h1 className="text-lg font-extrabold">Today&apos;s Sales</h1>
              <span className="text-sm text-slate-500">
                {new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Revenue cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                  <span className="text-xs text-slate-400 block mb-1">Total</span>
                  <span className="text-xl font-extrabold text-white">{formatCurrency(salesSummary.totalRevenue)}</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                  <span className="text-xs text-emerald-400 block mb-1">Cash</span>
                  <span className="text-xl font-extrabold text-emerald-300">{formatCurrency(salesSummary.cashRevenue)}</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                  <span className="text-xs text-blue-400 block mb-1">GCash</span>
                  <span className="text-xl font-extrabold text-blue-300">{formatCurrency(salesSummary.gcashRevenue)}</span>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                  <span className="text-xs text-orange-400 block mb-1">Utang</span>
                  <span className="text-xl font-extrabold text-orange-300">{formatCurrency(salesSummary.utangRevenue)}</span>
                </div>
              </div>

              {/* Order counts */}
              <div className="flex gap-3">
                <div className="flex-1 bg-slate-800 rounded-xl p-3 border border-slate-700 flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-white">{salesSummary.completedCount}</span>
                  <span className="text-sm text-slate-400">Completed</span>
                </div>
                {salesSummary.cancelledCount > 0 && (
                  <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 flex items-center gap-3">
                    <span className="text-2xl font-extrabold text-red-400">{salesSummary.cancelledCount}</span>
                    <span className="text-sm text-slate-400">Cancelled</span>
                  </div>
                )}
              </div>

              {/* Item breakdown */}
              {salesSummary.topItems.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-700">
                    <span className="text-xs font-bold text-slate-400">Items Sold</span>
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    {salesSummary.topItems.map(({ name, qty, revenue }) => (
                      <div key={name} className="px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-200 min-w-6 text-right">{qty}x</span>
                          <span className="text-sm text-slate-300">{name}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-400">{formatCurrency(revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Individual orders */}
              {completedOrders.length > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-700">
                    <span className="text-xs font-bold text-slate-400">Order History</span>
                  </div>
                  <div className="divide-y divide-slate-700/50">
                    {completedOrders.map((order) => (
                      <SwipeDeleteRow key={order.id} onDelete={() => setDeleteOrderId(order.id)}>
                        <div className="px-3 py-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {order.chip_number && (
                                <span className="text-sm font-extrabold text-slate-200">#{order.chip_number}</span>
                              )}
                              <span className={`text-xs font-semibold ${
                                order.payment_method === "gcash" ? "text-blue-400" : order.payment_method === "utang" ? "text-orange-400" : "text-emerald-400"
                              }`}>
                                {order.payment_method === "gcash" ? "GCash" : order.payment_method === "utang" ? "Utang" : "Cash"}
                              </span>
                              {order.status === "cancelled" && (
                                <span className="text-xs font-semibold text-red-400">Cancelled</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${order.status === "cancelled" ? "text-red-400 line-through" : "text-slate-200"}`}>
                                {formatCurrency(order.total)}
                              </span>
                              <span className="text-xs text-slate-600">
                                {new Date(order.created_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {(order.order_items ?? []).map((oi) => (
                              <span key={oi.id} className="text-xs text-slate-400">
                                {oi.quantity > 1 && <span className="text-slate-500">{oi.quantity}x </span>}
                                {oi.item_name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </SwipeDeleteRow>
                    ))}
                  </div>
                </div>
              )}

              {completedOrders.length === 0 && (
                <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
                  No sales yet today
                </div>
              )}
            </div>

            {/* Delete confirmation modal */}
            {deleteOrderId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDeleteOrderId(null)}>
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 mx-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                  <h2 className="text-lg font-bold text-white mb-2">Delete Order?</h2>
                  <p className="text-sm text-slate-400 mb-5">This will permanently remove this order from history.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteOrderId(null)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-300 border border-slate-600 hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteOrder}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
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
          onClick={() => setTab("sales")}
          className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors ${
            tab === "sales" ? "text-white" : "text-slate-500"
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-xs font-bold">Sales</span>
        </button>
      </div>
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
      <div className="flex items-center gap-2">
        <span className={`font-extrabold shrink-0 ${
          position === 0 ? "text-2xl text-indigo-300" : "text-xl text-indigo-400"
        }`}>
          {order.chip_number ?? "?"}
        </span>
        <div className="flex-1 min-w-0">
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
        {(order.order_items ?? []).map((oi) => (
          <div key={oi.id} className="flex items-start justify-between gap-1.5">
            <div className="flex items-start gap-1.5">
              <span className="text-slate-600 text-lg leading-tight">•</span>
              <span className={`text-base font-semibold leading-tight ${isPending ? "text-slate-100" : "text-slate-300"}`}>
                {oi.quantity > 1 && <span className="text-slate-400 mr-1">{oi.quantity}x</span>}
                {oi.item_name}
              </span>
            </div>
            <span className="text-xs text-slate-500 shrink-0 mt-0.5">
              {formatCurrency(oi.item_price * oi.quantity)}
            </span>
          </div>
        ))}
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

function SwipeDeleteRow({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const threshold = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    swiping.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping.current || !rowRef.current) return;
    const diff = e.touches[0].clientX - startX.current;
    currentX.current = Math.min(0, diff);
    rowRef.current.style.transform = `translateX(${currentX.current}px)`;
    rowRef.current.style.transition = "none";
  };

  const handleTouchEnd = () => {
    if (!swiping.current || !rowRef.current) return;
    swiping.current = false;
    rowRef.current.style.transition = "transform 0.2s ease-out";
    if (currentX.current < -threshold) {
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

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 w-20 bg-red-500 flex items-center justify-center">
        <button
          onClick={() => { resetSwipe(); onDelete(); }}
          className="text-white text-xs font-bold w-full h-full"
        >
          Delete
        </button>
      </div>
      <div
        ref={rowRef}
        className="relative bg-slate-800 z-10"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

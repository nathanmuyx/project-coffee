"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Order, MenuItem } from "@/lib/types";
import { formatCurrency, getShortName } from "@/lib/utils";
import { sendShowGcash, sendHideGcash } from "@/lib/kiosk-channel";
import { Snowflake, Fire } from "@phosphor-icons/react";

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
  const [tab, setTab] = useState<"orders" | "pos" | "menu">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const prevOrderIdsRef = useRef<Set<string>>(new Set());
  const [gcashShowing, setGcashShowing] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [posCart, setPosCart] = useState<Map<string, { item: MenuItem; qty: number }>>(new Map());
  const [cashModalOrder, setCashModalOrder] = useState<Order | null>(null);

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

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);


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
  const posTotalCost = Array.from(posCart.values()).reduce((s, { item, qty }) => s + item.cost * qty, 0);

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

  const submitPosOrder = async (method: "cash" | "gcash" | "utang") => {
    if (posCart.size === 0) return;
    const chipNumber = await assignNextNumber();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        total: posTotal,
        total_cost: posTotalCost,
        status: "preparing",
        chip_number: chipNumber,
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
      item_cost: item.cost,
      quantity: qty,
    }));
    await supabase.from("order_items").insert(items);
    setPosCart(new Map());
    fetchOrders();
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

  const updateMenuItem = async (id: string, updates: Partial<MenuItem>) => {
    await supabase.from("menu_items").update(updates).eq("id", id);
    setMenuItems((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));
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
                {menuItems.filter((m) => m.is_available).map((item) => {
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
          /* Menu Tab */
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
              <h1 className="text-lg font-extrabold">Menu</h1>
              <a
                href="/dashboard"
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                Dashboard
              </a>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="divide-y divide-slate-700/50">
                {menuItems.map((item) => (
                  <MenuItemRow key={item.id} item={item} onUpdate={updateMenuItem} />
                ))}
              </div>
              {menuItems.length === 0 && (
                <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
                  No menu items
                </div>
              )}
            </div>
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
          onClick={() => setTab("menu")}
          className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors ${
            tab === "menu" ? "text-white" : "text-slate-500"
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span className="text-xs font-bold">Menu</span>
        </button>
      </div>

      {/* Cash payment modal */}
      {cashModalOrder && (
        <CashPaymentModal
          order={cashModalOrder}
          onConfirm={() => {
            handleAcceptPayment(cashModalOrder.id);
            setCashModalOrder(null);
          }}
          onClose={() => setCashModalOrder(null)}
        />
      )}
    </div>
  );
}

function CashPaymentModal({ order, onConfirm, onClose }: { order: Order; onConfirm: () => void; onClose: () => void }) {
  const [inputStr, setInputStr] = useState("");
  const cashGiven = parseInt(inputStr, 10) || 0;
  const change = cashGiven - order.total;
  const hasEnough = cashGiven >= order.total;

  const tapDigit = (d: string) => setInputStr((v) => (v + d).slice(0, 6));
  const tapBackspace = () => setInputStr((v) => v.slice(0, -1));
  const tapPreset = (amt: number) => setInputStr(String(amt));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        {/* Block number */}
        <div className="flex flex-col items-center mb-4">
          <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center mb-2">
            <span className="text-3xl font-extrabold text-black">{order.chip_number ?? "?"}</span>
          </div>
          <span className="text-sm text-slate-300">Prepare block <span className="font-bold text-white">{order.chip_number}</span> for customer</span>
        </div>

        {/* Total */}
        <div className="text-center mb-4">
          <span className="text-sm text-slate-400">Total</span>
          <div className="text-3xl font-extrabold text-white">{formatCurrency(order.total)}</div>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[200, 500, 1000].map((amt) => (
            <button
              key={amt}
              onClick={() => tapPreset(amt)}
              className={`py-2.5 rounded-xl text-sm font-bold transition-colors ${
                cashGiven === amt
                  ? "bg-blue-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {formatCurrency(amt)}
            </button>
          ))}
        </div>

        {/* Calculator display */}
        <div className="bg-slate-900 rounded-xl px-4 py-2.5 mb-3 text-right">
          <span className="text-2xl font-extrabold text-white">
            {inputStr ? formatCurrency(cashGiven) : <span className="text-slate-600">₱0</span>}
          </span>
        </div>

        {/* Calculator keypad */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button
              key={d}
              onClick={() => tapDigit(d)}
              className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-lg font-bold text-white transition-colors active:scale-95"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setInputStr("")}
            className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-bold text-slate-400 transition-colors active:scale-95"
          >
            C
          </button>
          <button
            onClick={() => tapDigit("0")}
            className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-lg font-bold text-white transition-colors active:scale-95"
          >
            0
          </button>
          <button
            onClick={tapBackspace}
            className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white transition-colors active:scale-95 flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
            </svg>
          </button>
        </div>

        {/* Cash given & change */}
        {cashGiven > 0 && (
          <div className="bg-slate-900 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center">
              <span className={`text-3xl font-extrabold ${hasEnough ? "text-emerald-400" : "text-red-400"}`}>
                {hasEnough ? formatCurrency(change) : `-${formatCurrency(Math.abs(change))}`}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            Exact {formatCurrency(order.total)}
          </button>
          {cashGiven > 0 && hasEnough && (
            <button
              onClick={onConfirm}
              className="flex-1 py-3 rounded-xl text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-colors"
            >
              Confirm ({formatCurrency(change)} change)
            </button>
          )}
        </div>
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

function MenuItemRow({ item, onUpdate }: { item: MenuItem; onUpdate: (id: string, updates: Partial<MenuItem>) => void }) {
  const [price, setPrice] = useState(String(item.price));
  const [cost, setCost] = useState(String(item.cost));

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

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${!item.is_available ? "opacity-40" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-slate-200 truncate">{item.name}</div>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">Price</span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={savePrice}
              className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white font-semibold text-right"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">Cost</span>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              onBlur={saveCost}
              className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-400 font-semibold text-right"
            />
          </div>
        </div>
      </div>
      <button
        onClick={() => onUpdate(item.id, { is_available: !item.is_available })}
        className={`w-14 h-8 rounded-full relative transition-colors ${
          item.is_available ? "bg-emerald-500" : "bg-slate-600"
        }`}
      >
        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${
          item.is_available ? "right-1" : "left-1"
        }`} />
      </button>
    </div>
  );
}

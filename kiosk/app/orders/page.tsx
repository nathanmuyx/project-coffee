"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Order, OrderItem } from "@/lib/types";
import { formatCurrency, getDrinkColor, getShortName } from "@/lib/utils";

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

  // "Caramel None Coffee" or "Honey Citrus" without "coffee" keyword = no espresso
  if (lower.includes("none coffee")) {
    return { espresso: false, matcha: isMatcha };
  }

  return {
    espresso: isCoffee && !lower.includes("none coffee"),
    matcha: isMatcha,
  };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const prevOrderIdsRef = useRef<Set<string>>(new Set());

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

  const handleDelete = async (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);
    if (error) fetchOrders();
  };

  return (
    <div className="h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
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
        </div>
      </div>

      {/* Queue */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <span className="text-4xl mb-3">☕</span>
            <span className="text-sm">No pending orders</span>
          </div>
        )}
        {orders.map((order) => (
          <QueueCard
            key={order.id}
            order={order}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

function QueueCard({
  order,
  onComplete,
  onDelete,
}: {
  order: Order;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [elapsed, setElapsed] = useState("");

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

  return (
    <div className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3 border border-slate-700/60">
      {/* Chip number */}
      <span className="text-2xl font-extrabold text-indigo-400 w-12 text-center shrink-0">
        {order.chip_number ?? "?"}
      </span>

      {/* Items as colored pills */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-1.5">
          {(order.order_items ?? []).map((oi) => (
            <span
              key={oi.id}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${getDrinkColor(
                oi.item_name
              )}`}
            >
              {oi.quantity > 1 && <span>{oi.quantity}x</span>}
              {getShortName(oi.item_name)}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-500">
            {formatCurrency(order.total)}
          </span>
          <span className={`text-xs font-semibold ${
            order.payment_method === "gcash" ? "text-blue-400" : "text-emerald-500"
          }`}>
            {order.payment_method === "gcash" ? "GCash" : "Cash"}
          </span>
          <span className="text-xs text-slate-600">{elapsed}</span>
        </div>
      </div>

      {/* Actions */}
      <button
        onClick={() => onDelete(order.id)}
        className="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
      <button
        onClick={() => onComplete(order.id)}
        className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors shrink-0"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </button>
    </div>
  );
}

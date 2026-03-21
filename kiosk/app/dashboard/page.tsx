"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Order } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const OVERALL = "overall";

export default function DashboardPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(OVERALL);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch available dates
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("created_at")
        .in("status", ["completed", "cancelled"])
        .order("created_at", { ascending: false });

      if (!data) return;

      const unique = [
        ...new Set(
          data.map((r) =>
            new Date(r.created_at).toLocaleDateString("en-CA")
          )
        ),
      ];

      setDates(unique);

      const today = new Date().toLocaleDateString("en-CA");
      setSelectedDate(unique.includes(today) ? today : OVERALL);
    })();
  }, []);

  // Fetch orders for selected date
  const fetchOrders = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("orders")
      .select("*, order_items(*)")
      .in("status", ["completed", "cancelled"])
      .order("created_at", { ascending: false });

    if (selectedDate !== OVERALL) {
      const dateStart = `${selectedDate}T00:00:00`;
      const nextDay = new Date(selectedDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = `${nextDay.toLocaleDateString("en-CA")}T00:00:00`;
      query = query.gte("created_at", dateStart).lt("created_at", nextDayStr);
    }

    const { data } = await query;
    setOrders((data as Order[]) ?? []);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Analytics
  const stats = useMemo(() => {
    const completed = orders.filter((o) => o.status === "completed");
    const cancelled = orders.filter((o) => o.status === "cancelled");

    const revenue = completed.reduce((s, o) => s + o.total, 0);
    const cash = completed
      .filter((o) => o.payment_method === "cash")
      .reduce((s, o) => s + o.total, 0);
    const gcash = completed
      .filter((o) => o.payment_method === "gcash")
      .reduce((s, o) => s + o.total, 0);
    const utang = completed
      .filter((o) => o.payment_method === "utang")
      .reduce((s, o) => s + o.total, 0);

    const cups = completed.reduce(
      (s, o) => s + (o.order_items?.reduce((t, i) => t + i.quantity, 0) ?? 0),
      0
    );

    // Items breakdown
    const itemMap = new Map<
      string,
      { qty: number; revenue: number }
    >();
    for (const o of completed) {
      for (const item of o.order_items ?? []) {
        const existing = itemMap.get(item.item_name) ?? {
          qty: 0,
          revenue: 0,
        };
        existing.qty += item.quantity;
        existing.revenue += item.item_price * item.quantity;
        itemMap.set(item.item_name, existing);
      }
    }
    const items = [...itemMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty);

    const totalCost = completed.reduce((s, o) => s + o.total_cost, 0);
    const profit = revenue - totalCost;

    return {
      revenue,
      cash,
      gcash,
      utang,
      totalCost,
      profit,
      cups,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      items,
    };
  }, [orders]);

  function formatDateLabel(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-PH", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/orders"
          className="text-slate-400 text-sm font-medium hover:text-white"
        >
          &larr; Orders
        </Link>
        <h1 className="text-lg font-bold flex-1 text-center">Dashboard</h1>
        <div className="w-16" />
      </div>

      {/* Date dropdown */}
      <select
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        className="w-full mb-4 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-slate-600"
      >
        <option value={OVERALL}>Overall</option>
        {dates.map((d) => (
          <option key={d} value={d}>
            {formatDateLabel(d)}
          </option>
        ))}
      </select>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : (
        <div className="space-y-3">
          {/* Revenue grid 2x2 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-slate-400">Total Revenue</div>
              <div className="text-xl font-extrabold text-white">
                {formatCurrency(stats.revenue)}
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-emerald-400">Cash</div>
              <div className="text-xl font-extrabold text-emerald-300">
                {formatCurrency(stats.cash)}
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-blue-400">GCash</div>
              <div className="text-xl font-extrabold text-blue-300">
                {formatCurrency(stats.gcash)}
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-orange-400">Utang</div>
              <div className="text-xl font-extrabold text-orange-300">
                {formatCurrency(stats.utang)}
              </div>
            </div>
          </div>

          {/* Cost & Profit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-slate-400">Cost</div>
              <div className="text-xl font-extrabold text-slate-300">
                {formatCurrency(stats.totalCost)}
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-emerald-400">Profit</div>
              <div className="text-xl font-extrabold text-emerald-300">
                {formatCurrency(stats.profit)}
              </div>
            </div>
          </div>

          {/* Counts row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-slate-400">Cups Sold</div>
              <div className="text-xl font-extrabold text-white">
                {stats.cups}
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-slate-400">Orders</div>
              <div className="text-xl font-extrabold text-white">
                {stats.completedCount}
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-xs text-slate-400">Cancelled</div>
              <div className="text-xl font-extrabold text-white">
                {stats.cancelledCount}
              </div>
            </div>
          </div>

          {/* Items sold table */}
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-400">
                Items Sold
              </div>
              <div className="text-xs font-bold text-slate-400">
                {stats.cups} cups
              </div>
            </div>
            <div className="space-y-1.5">
              {stats.items.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white w-6 text-right">
                      {item.qty}
                    </span>
                    <span className="text-sm font-bold text-slate-300">
                      {item.name}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatCurrency(item.revenue)}
                  </span>
                </div>
              ))}
              {stats.items.length === 0 && (
                <div className="text-xs text-slate-500 text-center py-2">
                  No items sold
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

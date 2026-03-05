"use client";

import { Order } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { useEffect, useState } from "react";

interface OrderCardProps {
  order: Order;
  onAction: (orderId: string, newStatus: Order["status"]) => void;
  onDelete: (orderId: string) => void;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; next: Order["status"] }> = {
  pending: {
    label: "Start Preparing",
    color: "bg-amber-500 hover:bg-amber-400",
    next: "preparing",
  },
  preparing: {
    label: "Mark Ready",
    color: "bg-emerald-500 hover:bg-emerald-400",
    next: "ready",
  },
  ready: {
    label: "Complete",
    color: "bg-indigo-500 hover:bg-indigo-400",
    next: "completed",
  },
};

function ElapsedTime({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Math.floor(
        (Date.now() - new Date(since).getTime()) / 1000
      );
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [since]);

  return <span>{elapsed}</span>;
}

export function OrderCard({ order, onAction, onDelete }: OrderCardProps) {
  const config = ACTION_CONFIG[order.status];
  if (!config) return null;

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-extrabold text-indigo-400">
            #{order.chip_number}
          </span>
          <span className="text-xs text-slate-500">
            #{order.order_number}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            <ElapsedTime since={order.created_at} />
          </span>
          <button
            onClick={() => onDelete(order.id)}
            className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
            title="Delete order"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-1 mb-3">
        {order.order_items?.map((oi) => (
          <div key={oi.id} className="flex justify-between text-sm">
            <span className="text-slate-300">
              {oi.quantity}x {oi.item_name}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-300">
          {formatCurrency(order.total)}
        </span>
        <button
          onClick={() => onAction(order.id, config.next)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors active:scale-95 ${config.color}`}
        >
          {config.label}
        </button>
      </div>
    </div>
  );
}

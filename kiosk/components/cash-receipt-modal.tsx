"use client";

import { Order } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface CashReceiptModalProps {
  order: Order;
  cashTendered: number;
  onClose: () => void;
}

export function CashReceiptModal({ order, cashTendered, onClose }: CashReceiptModalProps) {
  const change = cashTendered - order.total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center mb-4">
          <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mb-2">
            <span className="text-5xl font-extrabold text-black">{order.chip_number ?? "?"}</span>
          </div>
          <span className="text-sm text-slate-300">
            Prepare block <span className="font-bold text-white">{order.chip_number}</span>
          </span>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-2.5">
            <span className="text-xs text-slate-400">Total</span>
            <span className="text-base font-bold text-white">{formatCurrency(order.total)}</span>
          </div>
          <div className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-2.5">
            <span className="text-xs text-slate-400">Cash given</span>
            <span className="text-base font-bold text-white">{formatCurrency(cashTendered)}</span>
          </div>
          <div className="flex items-center justify-between bg-emerald-500/15 border border-emerald-500/30 rounded-xl px-4 py-3">
            <span className="text-xs font-bold text-emerald-300 uppercase">Change</span>
            <span className="text-2xl font-extrabold text-emerald-300">{formatCurrency(change)}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

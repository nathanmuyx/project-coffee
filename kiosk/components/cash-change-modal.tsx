"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";

interface CashChangeModalProps {
  total: number;
  onConfirm: (tendered: number) => Promise<void>;
  onClose: () => void;
}

export function CashChangeModal({ total, onConfirm, onClose }: CashChangeModalProps) {
  const [inputStr, setInputStr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const cashGiven = parseInt(inputStr, 10) || 0;
  const change = cashGiven - total;
  const hasEnough = cashGiven >= total;

  const tapDigit = (d: string) => setInputStr((v) => (v + d).slice(0, 6));
  const tapBackspace = () => setInputStr((v) => v.slice(0, -1));
  const tapPreset = (amt: number) => setInputStr(String(amt));

  const submit = async (amount: number) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(amount);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={submitting ? undefined : onClose}>
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4">
          <span className="text-sm text-slate-400">Total</span>
          <div className="text-3xl font-extrabold text-white">{formatCurrency(total)}</div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[200, 500, 1000].map((amt) => (
            <button
              key={amt}
              onClick={() => tapPreset(amt)}
              disabled={submitting}
              className={`py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                cashGiven === amt
                  ? "bg-blue-500 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {formatCurrency(amt)}
            </button>
          ))}
        </div>

        <div className="bg-slate-900 rounded-xl px-4 py-2.5 mb-3 text-right">
          <span className="text-2xl font-extrabold text-white">
            {inputStr ? formatCurrency(cashGiven) : <span className="text-slate-600">₱0</span>}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <button
              key={d}
              onClick={() => tapDigit(d)}
              disabled={submitting}
              className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-lg font-bold text-white transition-colors active:scale-95 disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setInputStr("")}
            disabled={submitting}
            className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-bold text-slate-400 transition-colors active:scale-95 disabled:opacity-50"
          >
            C
          </button>
          <button
            onClick={() => tapDigit("0")}
            disabled={submitting}
            className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-lg font-bold text-white transition-colors active:scale-95 disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={tapBackspace}
            disabled={submitting}
            className="py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white transition-colors active:scale-95 flex items-center justify-center disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
            </svg>
          </button>
        </div>

        {cashGiven > 0 && (
          <div className="bg-slate-900 rounded-xl p-4 mb-4 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Change</span>
            <div className={`text-3xl font-extrabold ${hasEnough ? "text-emerald-400" : "text-red-400"}`}>
              {hasEnough ? formatCurrency(change) : `-${formatCurrency(Math.abs(change))}`}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => submit(total)}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving…" : `Exact ${formatCurrency(total)}`}
          </button>
          {cashGiven > 0 && hasEnough && (
            <button
              onClick={() => submit(cashGiven)}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl text-sm font-bold bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving…" : `Confirm (${formatCurrency(change)} change)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

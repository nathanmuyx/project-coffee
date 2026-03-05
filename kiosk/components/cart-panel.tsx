"use client";

import { CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface CartPanelProps {
  items: CartItem[];
  onUpdateQuantity: (menuItemId: string, delta: number) => void;
  onContinue: () => void;
  onClear: () => void;
}

export function CartPanel({
  items,
  onUpdateQuantity,
  onContinue,
  onClear,
}: CartPanelProps) {
  const total = items.reduce(
    (sum, i) => sum + i.menuItem.price * i.quantity,
    0
  );
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h2 className="text-lg font-bold">Your Order</h2>
        {items.length > 0 && (
          <button
            onClick={onClear}
            className="text-sm text-slate-400 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <svg
              className="w-12 h-12 mb-3 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
              />
            </svg>
            <span className="text-sm">Tap items to add</span>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.menuItem.id}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {item.menuItem.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatCurrency(item.menuItem.price)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQuantity(item.menuItem.id, -1)}
                    className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-lg font-bold transition-colors"
                  >
                    -
                  </button>
                  <span className="w-6 text-center font-semibold">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(item.menuItem.id, 1)}
                    className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-lg font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
                <div className="text-sm font-semibold w-16 text-right">
                  {formatCurrency(item.menuItem.price * item.quantity)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-700">
        <div className="flex justify-between items-center mb-3">
          <span className="text-slate-400">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
          <span className="text-xl font-bold">{formatCurrency(total)}</span>
        </div>
        <button
          onClick={onContinue}
          disabled={items.length === 0}
          className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 disabled:text-slate-500 font-semibold text-lg transition-colors active:scale-[0.98]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

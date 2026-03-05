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
    <div className="fixed top-0 right-0 bottom-0 w-80 flex flex-col bg-gray-50 border-l border-gray-200 z-10">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-black">Your Order</h2>
        {items.length > 0 && (
          <button
            onClick={onClear}
            className="text-base text-gray-400 hover:text-red-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-lg">Tap items to add</span>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.menuItem.id}
                className="bg-white rounded-xl p-3 border border-gray-200"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="text-lg font-bold text-black leading-tight">
                    {item.menuItem.name}
                  </div>
                  <div className="text-lg font-bold text-black shrink-0 ml-2">
                    {formatCurrency(item.menuItem.price * item.quantity)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onUpdateQuantity(item.menuItem.id, -1)}
                    className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-xl font-bold text-black transition-colors"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-bold text-xl text-black">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(item.menuItem.id, 1)}
                    className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-xl font-bold text-black transition-colors"
                  >
                    +
                  </button>
                  <span className="text-sm text-gray-500 ml-auto">
                    {formatCurrency(item.menuItem.price)} each
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex justify-between items-center mb-3">
          <span className="text-lg text-gray-500">
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
          <span className="text-2xl font-extrabold text-black">{formatCurrency(total)}</span>
        </div>
        <button
          onClick={onContinue}
          disabled={items.length === 0}
          className="w-full py-4 rounded-xl bg-black hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xl transition-colors active:scale-[0.98]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

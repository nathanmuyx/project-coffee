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
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200">
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
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.menuItem.id}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-black truncate">
                    {item.menuItem.name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatCurrency(item.menuItem.price)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateQuantity(item.menuItem.id, -1)}
                    className="w-9 h-9 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-xl font-bold text-black transition-colors"
                  >
                    -
                  </button>
                  <span className="w-6 text-center font-bold text-lg text-black">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => onUpdateQuantity(item.menuItem.id, 1)}
                    className="w-9 h-9 rounded-lg bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-xl font-bold text-black transition-colors"
                  >
                    +
                  </button>
                </div>
                <div className="text-base font-bold w-16 text-right text-black">
                  {formatCurrency(item.menuItem.price * item.quantity)}
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

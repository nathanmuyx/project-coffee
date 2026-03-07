"use client";

import { useState, useMemo } from "react";
import { MenuItem, CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { DisplayDrink } from "@/lib/menu-config";

interface MenuGridProps {
  drinks: DisplayDrink[];
  cart: CartItem[];
  onAddItem: (item: MenuItem, quantity: number) => void;
}

export function MenuGrid({ drinks, cart, onAddItem }: MenuGridProps) {
  const [selecting, setSelecting] = useState<DisplayDrink | null>(null);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [quantity, setQuantity] = useState(1);

  // Map menu item id -> qty in cart for badge display
  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cart) {
      map.set(c.menuItem.id, (map.get(c.menuItem.id) ?? 0) + c.quantity);
    }
    return map;
  }, [cart]);

  const openModal = (drink: DisplayDrink) => {
    setSelecting(drink);
    setSelectedVariant(0);
    setQuantity(1);
  };

  const handleAdd = () => {
    if (!selecting) return;
    onAddItem(selecting.variants[selectedVariant].menuItem, quantity);
    setSelecting(null);
  };

  return (
    <>
      <div className="h-full overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {drinks.map((drink) => {
            const badgeQty = drink.variants.reduce(
              (sum, v) => sum + (cartQtyMap.get(v.menuItem.id) ?? 0),
              0
            );
            return (
              <button
                key={drink.name}
                onClick={() => openModal(drink)}
                className="relative flex flex-col rounded-2xl bg-white border border-gray-200 overflow-hidden transition-all active:scale-95 text-left shadow-sm"
              >
                {badgeQty > 0 && (
                  <span className="absolute top-2 right-2 z-10 min-w-10 h-10 flex items-center justify-center rounded-full bg-black text-white text-xl font-bold px-2">
                    {badgeQty}
                  </span>
                )}
                <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center relative overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={drink.image}
                    alt={drink.name}
                    className="w-full h-full object-cover absolute inset-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="p-4">
                  <div className="font-bold text-lg text-black leading-tight">
                    {drink.name}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-2xl font-extrabold text-black">
                      {formatCurrency(drink.price)}
                    </span>
                    {drink.variants.length > 1 && (
                      <span className="text-sm text-gray-500 font-medium">Hot / Iced</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {drinks.length === 0 && (
          <div className="flex items-center justify-center h-40 text-gray-400">
            No items available
          </div>
        )}
      </div>

      {/* Item modal */}
      {selecting && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelecting(null)}
        >
          <div
            className="bg-white w-full max-w-md rounded-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div className="w-full aspect-[3/2] bg-gray-100 relative overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selecting.image}
                alt={selecting.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            <div className="p-8">
              <h3 className="text-3xl font-bold text-black text-center mb-1">
                {selecting.name}
              </h3>
              <p className="text-2xl text-gray-500 text-center mb-6">
                {formatCurrency(selecting.variants[selectedVariant].menuItem.price)}
              </p>

              {/* Hot / Iced radio */}
              {selecting.variants.length > 1 && (
                <div className="flex gap-3 mb-6">
                  {selecting.variants.map((v, i) => (
                    <button
                      key={v.label}
                      onClick={() => setSelectedVariant(i)}
                      className={`flex-1 py-5 rounded-xl text-center transition-colors border-2 ${
                        selectedVariant === i
                          ? "bg-gray-100 border-black"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <span className={`text-2xl font-bold ${selectedVariant === i ? "text-black" : "text-gray-400"}`}>{v.label}</span>
                      <span className={`block text-lg mt-0.5 ${selectedVariant === i ? "text-gray-600" : "text-gray-300"}`}>
                        {formatCurrency(v.menuItem.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Quantity */}
              <div className="flex items-center justify-center gap-6 mb-8">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-16 h-16 rounded-2xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-4xl font-bold text-black transition-colors active:scale-95"
                >
                  -
                </button>
                <span className="text-5xl font-extrabold text-black w-14 text-center">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-16 h-16 rounded-2xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-4xl font-bold text-black transition-colors active:scale-95"
                >
                  +
                </button>
              </div>

              {/* Add to cart */}
              <button
                onClick={handleAdd}
                className="w-full py-5 rounded-xl bg-black hover:bg-gray-800 text-white font-bold text-2xl transition-colors active:scale-[0.98]"
              >
                Add to Cart — {formatCurrency(selecting.variants[selectedVariant].menuItem.price * quantity)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

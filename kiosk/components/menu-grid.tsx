"use client";

import { useState, useMemo } from "react";
import { MenuItem, CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { DisplayDrink } from "@/lib/menu-config";
import { VariantPickerModal } from "./variant-picker-modal";

interface MenuGridProps {
  drinks: DisplayDrink[];
  cart: CartItem[];
  onAddItem: (item: MenuItem, quantity: number) => void;
}

export function MenuGrid({ drinks, cart, onAddItem }: MenuGridProps) {
  const [variantPicker, setVariantPicker] = useState<DisplayDrink | null>(null);

  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cart) {
      map.set(c.menuItem.id, (map.get(c.menuItem.id) ?? 0) + c.quantity);
    }
    return map;
  }, [cart]);

  const handleTap = (drink: DisplayDrink) => {
    if (drink.variants.length === 1) {
      const item = drink.variants[0].menuItem;
      const inCart = cartQtyMap.get(item.id) ?? 0;
      onAddItem(item, inCart > 0 ? -inCart : 1);
    } else {
      setVariantPicker(drink);
    }
  };

  const handleVariantPick = (menuItem: MenuItem) => {
    const inCart = cartQtyMap.get(menuItem.id) ?? 0;
    onAddItem(menuItem, inCart > 0 ? -inCart : 1);
    setVariantPicker(null);
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
                onClick={() => handleTap(drink)}
                className={`relative flex flex-col rounded-2xl overflow-hidden transition-all active:scale-[0.97] text-left shadow-sm ${
                  badgeQty > 0 ? "bg-white border-2 border-black ring-2 ring-black/10" : "bg-white border border-gray-200"
                }`}
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
                      <span className="text-base font-bold text-gray-400">Hot / Iced</span>
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

      {variantPicker && (
        <VariantPickerModal
          drink={variantPicker}
          cartQtyMap={cartQtyMap}
          onPick={handleVariantPick}
          onClose={() => setVariantPicker(null)}
        />
      )}
    </>
  );
}

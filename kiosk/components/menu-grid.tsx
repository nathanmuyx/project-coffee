"use client";

import { useState, useMemo } from "react";
import { MenuItem, CartItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { DisplayDrink } from "@/lib/menu-config";
import { Snowflake, Fire } from "@phosphor-icons/react";

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
      onAddItem(drink.variants[0].menuItem, 1);
    } else {
      setVariantPicker(drink);
    }
  };

  const handleVariantPick = (variant: { label: string; menuItem: MenuItem }) => {
    onAddItem(variant.menuItem, 1);
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
                className="relative flex flex-col rounded-2xl bg-white border border-gray-200 overflow-hidden transition-all active:scale-[0.97] text-left shadow-sm"
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

      {/* Hot / Iced variant picker */}
      {variantPicker && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setVariantPicker(null)}
        >
          <div
            className="bg-white w-full max-w-md rounded-3xl p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-3xl font-bold text-black text-center mb-6">
              {variantPicker.name}
            </h3>
            <div className="flex gap-4">
              {variantPicker.variants.map((v) => {
                const isHot = /hot/i.test(v.label);
                return (
                  <button
                    key={v.label}
                    onClick={() => handleVariantPick(v)}
                    className="flex-1 flex flex-col items-center gap-3 py-10 rounded-2xl bg-gray-100 hover:bg-gray-200 border-2 border-gray-200 text-center transition-colors active:scale-95"
                  >
                    {isHot
                      ? <Fire size={52} weight="fill" className="text-red-500" />
                      : <Snowflake size={52} weight="fill" className="text-blue-500" />
                    }
                    <span className="text-4xl font-extrabold text-black">{v.label}</span>
                    <span className="text-2xl text-gray-500 font-semibold">
                      {formatCurrency(v.menuItem.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

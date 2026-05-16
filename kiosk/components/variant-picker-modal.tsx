"use client";

import { MenuItem } from "@/lib/types";
import { DisplayDrink } from "@/lib/menu-config";
import { formatCurrency } from "@/lib/utils";
import { Snowflake, Fire } from "@phosphor-icons/react";

interface VariantPickerModalProps {
  drink: DisplayDrink;
  cartQtyMap?: Map<string, number>;
  onPick: (menuItem: MenuItem) => void;
  onClose: () => void;
}

export function VariantPickerModal({ drink, cartQtyMap, onPick, onClose }: VariantPickerModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-3xl p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-3xl font-bold text-black text-center mb-6">
          {drink.name}
        </h3>
        <div className="flex gap-4">
          {drink.variants.map((v) => {
            const isHot = /hot/i.test(v.label);
            const isInCart = (cartQtyMap?.get(v.menuItem.id) ?? 0) > 0;
            return (
              <button
                key={v.label || v.menuItem.id}
                onClick={() => onPick(v.menuItem)}
                className={`flex-1 flex flex-col items-center gap-3 py-10 rounded-2xl text-center transition-colors active:scale-95 ${
                  isInCart ? "bg-black text-white border-2 border-black" : "bg-gray-100 hover:bg-gray-200 border-2 border-gray-200"
                }`}
              >
                {isHot
                  ? <Fire size={52} weight="fill" className="text-red-500" />
                  : <Snowflake size={52} weight="fill" className="text-blue-500" />
                }
                <span className={`text-4xl font-extrabold ${isInCart ? "text-white" : "text-black"}`}>{v.label || v.menuItem.name}</span>
                <span className={`text-2xl font-semibold ${isInCart ? "text-gray-300" : "text-gray-500"}`}>
                  {formatCurrency(v.menuItem.price)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

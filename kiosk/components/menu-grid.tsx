"use client";

import { useState } from "react";
import { MenuItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { DisplayDrink } from "@/lib/menu-config";

interface MenuGridProps {
  drinks: DisplayDrink[];
  onAddItem: (item: MenuItem) => void;
}

export function MenuGrid({ drinks, onAddItem }: MenuGridProps) {
  const [selecting, setSelecting] = useState<DisplayDrink | null>(null);

  const handleTap = (drink: DisplayDrink) => {
    if (drink.variants.length === 1) {
      onAddItem(drink.variants[0].menuItem);
    } else {
      setSelecting(drink);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {drinks.map((drink) => (
            <button
              key={drink.name}
              onClick={() => handleTap(drink)}
              className="flex flex-col rounded-2xl bg-white border border-gray-200 overflow-hidden transition-all active:scale-95 text-left shadow-sm"
            >
              {/* Image */}
              <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center relative">
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
          ))}
        </div>
        {drinks.length === 0 && (
          <div className="flex items-center justify-center h-40 text-gray-400">
            No items available
          </div>
        )}
      </div>

      {/* Hot/Iced picker overlay */}
      {selecting && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelecting(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-3xl p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold text-black text-center mb-1">{selecting.name}</h3>
            <p className="text-gray-500 text-center text-base mb-6">Choose your preference</p>
            <div className="flex gap-3 justify-center">
              {selecting.variants.map((v) => (
                <button
                  key={v.label}
                  onClick={() => {
                    onAddItem(v.menuItem);
                    setSelecting(null);
                  }}
                  className="w-36 flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 hover:border-black transition-colors active:scale-95"
                >
                  <span className="text-2xl font-bold text-black">{v.label}</span>
                  <span className="text-lg text-gray-600 font-semibold">
                    {formatCurrency(v.menuItem.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

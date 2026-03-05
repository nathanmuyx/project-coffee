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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {drinks.map((drink) => (
            <button
              key={drink.name}
              onClick={() => handleTap(drink)}
              className="flex flex-col rounded-2xl bg-slate-800 border border-slate-700/60 overflow-hidden transition-all active:scale-95 text-left"
            >
              {/* Image placeholder */}
              <div className={`w-full aspect-square ${drink.color} flex items-center justify-center relative`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={drink.image}
                  alt={drink.name}
                  className="w-full h-full object-cover absolute inset-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {/* Fallback icon when no image */}
                <span className="text-4xl opacity-60 select-none">☕</span>
              </div>
              <div className="p-3">
                <div className="font-semibold text-sm text-slate-50 leading-tight">
                  {drink.name}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-base font-bold text-white/80">
                    {formatCurrency(drink.price)}
                  </span>
                  {drink.variants.length > 1 && (
                    <span className="text-xs text-slate-400">Hot / Iced</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
        {drinks.length === 0 && (
          <div className="flex items-center justify-center h-40 text-slate-500">
            No items available
          </div>
        )}
      </div>

      {/* Hot/Iced picker overlay */}
      {selecting && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
          onClick={() => setSelecting(null)}
        >
          <div
            className="bg-slate-800 w-full max-w-md rounded-t-3xl p-6 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-slate-600 rounded-full mx-auto mb-5" />
            <h3 className="text-xl font-bold text-center mb-1">{selecting.name}</h3>
            <p className="text-slate-400 text-center text-sm mb-6">Choose your preference</p>
            <div className="flex gap-3">
              {selecting.variants.map((v) => (
                <button
                  key={v.label}
                  onClick={() => {
                    onAddItem(v.menuItem);
                    setSelecting(null);
                  }}
                  className="flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl bg-slate-700 hover:bg-slate-600 transition-colors active:scale-95"
                >
                  <span className="text-3xl">
                    {v.label === "Iced" ? "🧊" : "🔥"}
                  </span>
                  <span className="text-lg font-bold">{v.label}</span>
                  <span className="text-sm text-slate-300">
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

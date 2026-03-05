"use client";

import { useState } from "react";
import { MenuItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { DisplayDrink } from "@/lib/menu-config";

interface MenuGridProps {
  drinks: DisplayDrink[];
  onAddItem: (item: MenuItem, quantity: number) => void;
}

export function MenuGrid({ drinks, onAddItem }: MenuGridProps) {
  const [selecting, setSelecting] = useState<DisplayDrink | null>(null);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [quantity, setQuantity] = useState(1);

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
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {drinks.map((drink) => (
            <button
              key={drink.name}
              onClick={() => openModal(drink)}
              className="flex flex-col rounded-2xl bg-white border border-gray-200 overflow-hidden transition-all active:scale-95 text-left shadow-sm"
            >
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

      {/* Item modal */}
      {selecting && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelecting(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-3xl p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold text-black text-center mb-1">
              {selecting.name}
            </h3>
            <p className="text-xl text-gray-500 text-center mb-6">
              {formatCurrency(selecting.variants[selectedVariant].menuItem.price)}
            </p>

            {/* Hot / Iced radio */}
            {selecting.variants.length > 1 && (
              <div className="flex gap-2 mb-6">
                {selecting.variants.map((v, i) => (
                  <button
                    key={v.label}
                    onClick={() => setSelectedVariant(i)}
                    className={`flex-1 py-4 rounded-xl text-xl font-bold text-center transition-colors ${
                      selectedVariant === i
                        ? "bg-black text-white"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}

            {/* Quantity */}
            <div className="flex items-center justify-center gap-6 mb-8">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-2xl font-bold text-black transition-colors"
              >
                -
              </button>
              <span className="text-4xl font-extrabold text-black w-12 text-center">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-2xl font-bold text-black transition-colors"
              >
                +
              </button>
            </div>

            {/* Add to cart */}
            <button
              onClick={handleAdd}
              className="w-full py-4 rounded-xl bg-black hover:bg-gray-800 text-white font-bold text-xl transition-colors active:scale-[0.98]"
            >
              Add to Cart — {formatCurrency(selecting.variants[selectedVariant].menuItem.price * quantity)}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

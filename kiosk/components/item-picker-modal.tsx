"use client";

import { useState } from "react";
import { MenuItem, Modifier } from "@/lib/types";
import { DisplayDrink } from "@/lib/menu-config";
import { ADD_ONS } from "@/lib/add-ons";
import { formatCurrency } from "@/lib/utils";
import { Snowflake, Fire } from "@phosphor-icons/react";

interface ItemPickerModalProps {
  drink: DisplayDrink;
  onAdd: (menuItem: MenuItem, modifiers: Modifier[]) => void;
  onClose: () => void;
}

export function ItemPickerModal({ drink, onAdd, onClose }: ItemPickerModalProps) {
  const needsVariant = drink.variants.length > 1;
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number>(needsVariant ? -1 : 0);
  const [selectedAddOns, setSelectedAddOns] = useState<Modifier[]>([]);

  const toggleAddOn = (mod: Modifier) => {
    setSelectedAddOns((prev) =>
      prev.some((m) => m.name === mod.name)
        ? prev.filter((m) => m.name !== mod.name)
        : [...prev, mod]
    );
  };

  const addOnTotal = selectedAddOns.reduce((s, m) => s + m.price_delta, 0);
  const variant = selectedVariantIdx >= 0 ? drink.variants[selectedVariantIdx] : null;
  const lineTotal = (variant?.menuItem.price ?? 0) + addOnTotal;
  const canAdd = variant !== null;

  const handleAdd = () => {
    if (!variant) return;
    onAdd(variant.menuItem, selectedAddOns);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-700 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <h3 className="text-base font-extrabold text-white">{drink.name}</h3>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-xs font-bold text-slate-400 border border-slate-600 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {needsVariant && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Variant</div>
              <div className="grid grid-cols-2 gap-2">
                {drink.variants.map((v, idx) => {
                  const isHot = /hot/i.test(v.label);
                  const selected = idx === selectedVariantIdx;
                  return (
                    <button
                      key={v.label || v.menuItem.id}
                      onClick={() => setSelectedVariantIdx(idx)}
                      className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-colors ${
                        selected
                          ? "bg-blue-500/20 border-blue-400 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500"
                      }`}
                    >
                      {isHot
                        ? <Fire size={28} weight="fill" className="text-red-400" />
                        : <Snowflake size={28} weight="fill" className="text-blue-400" />}
                      <span className="text-base font-bold">{v.label || v.menuItem.name}</span>
                      <span className="text-xs text-slate-400">{formatCurrency(v.menuItem.price)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Add-ons</div>
            <div className="space-y-1.5">
              {ADD_ONS.map((mod) => {
                const checked = selectedAddOns.some((m) => m.name === mod.name);
                return (
                  <button
                    key={mod.name}
                    onClick={() => toggleAddOn(mod)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
                      checked
                        ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${
                          checked ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-500"
                        }`}
                      >
                        {checked ? "✓" : ""}
                      </span>
                      <span className="text-sm font-semibold">{mod.name}</span>
                    </span>
                    <span className="text-sm font-bold text-slate-300">+{formatCurrency(mod.price_delta)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-700 px-4 py-3 flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {variant ? formatCurrency(variant.menuItem.price) : "—"}
            {addOnTotal > 0 && (
              <span className="text-emerald-400 ml-1">+ {formatCurrency(addOnTotal)}</span>
            )}
          </span>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="ml-auto px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-extrabold transition-colors"
          >
            Add {canAdd ? formatCurrency(lineTotal) : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

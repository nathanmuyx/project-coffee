"use client";

import { useState } from "react";

interface ChipNumberInputProps {
  onSubmit: (chipNumber: number) => void;
  onBack: () => void;
}

export function ChipNumberInput({ onSubmit, onBack }: ChipNumberInputProps) {
  const [value, setValue] = useState("");

  const handleDigit = (digit: string) => {
    if (value.length < 2) {
      setValue((v) => v + digit);
    }
  };

  const handleDelete = () => {
    setValue((v) => v.slice(0, -1));
  };

  const handleConfirm = () => {
    const num = parseInt(value, 10);
    if (num >= 1 && num <= 99) {
      onSubmit(num);
    }
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <button
        onClick={onBack}
        className="self-start mb-6 text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h2 className="text-2xl font-bold mb-2">Enter Your Chip Number</h2>
      <p className="text-slate-400 mb-8">
        Enter the number on your table chip/tent
      </p>

      <div className="w-full max-w-xs">
        <div className="bg-slate-800 rounded-2xl p-6 mb-4 text-center border border-slate-700">
          <span className="text-6xl font-bold tracking-wider">
            {value || (
              <span className="text-slate-600">#</span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {digits.map((d) => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="h-16 rounded-xl bg-slate-800 hover:bg-slate-700 text-2xl font-semibold transition-colors active:scale-95"
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleDelete}
            className="h-16 rounded-xl bg-slate-800 hover:bg-slate-700 text-xl transition-colors active:scale-95 flex items-center justify-center"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
            </svg>
          </button>
          <button
            onClick={() => handleDigit("0")}
            className="h-16 rounded-xl bg-slate-800 hover:bg-slate-700 text-2xl font-semibold transition-colors active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleConfirm}
            disabled={!value || parseInt(value, 10) < 1}
            className="h-16 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 disabled:text-slate-500 text-xl font-semibold transition-colors active:scale-95"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

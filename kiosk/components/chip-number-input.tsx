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
        className="self-start mb-6 text-gray-400 hover:text-black transition-colors flex items-center gap-2 text-lg"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h2 className="text-3xl font-bold text-black mb-2">Enter Your Waiting Number</h2>
      <p className="text-xl text-gray-500 mb-8">
        Enter your waiting number
      </p>

      <div className="w-full max-w-xs">
        <div className="bg-gray-50 rounded-2xl p-8 mb-6 text-center border border-gray-200">
          <span className="text-9xl font-extrabold text-black tracking-wider">
            {value || (
              <span className="text-gray-300">#</span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {digits.map((d) => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="py-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-4xl font-bold text-black transition-colors active:scale-95"
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleDelete}
            className="py-5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors active:scale-95 flex items-center justify-center"
          >
            <svg className="w-9 h-9 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
            </svg>
          </button>
          <button
            onClick={() => handleDigit("0")}
            className="py-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-4xl font-bold text-black transition-colors active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleConfirm}
            disabled={!value || parseInt(value, 10) < 1}
            className="py-5 rounded-xl bg-black hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white text-3xl font-bold transition-colors active:scale-95"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

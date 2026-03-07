"use client";

interface ChipNumberInputProps {
  onSubmit: (chipNumber: number) => void;
  onBack: () => void;
  takenNumbers?: number[];
}

const BLOCKS = Array.from({ length: 20 }, (_, i) => i + 1);

export function ChipNumberInput({ onSubmit, onBack, takenNumbers = [] }: ChipNumberInputProps) {
  const takenSet = new Set(takenNumbers);

  return (
    <div className="flex flex-col h-full p-6">
      <button
        onClick={onBack}
        className="self-start mb-4 text-gray-400 hover:text-black transition-colors flex items-center gap-2 text-lg"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h2 className="text-3xl font-bold text-black text-center mb-1">Pick Your Block</h2>
      <p className="text-lg text-gray-500 text-center mb-6">
        Return & claim your order.
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-4 gap-3 max-w-lg mx-auto">
          {BLOCKS.map((num) => {
            const taken = takenSet.has(num);
            return (
              <button
                key={num}
                onClick={() => !taken && onSubmit(num)}
                disabled={taken}
                className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center transition-all active:scale-95 ${
                  taken
                    ? "bg-gray-100 border-gray-200 opacity-30 cursor-not-allowed"
                    : "bg-white border-gray-300 hover:border-black hover:shadow-lg"
                }`}
              >
                <span className={`text-4xl font-extrabold ${taken ? "text-gray-300" : "text-black"}`}>
                  {num}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

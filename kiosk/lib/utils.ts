export function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString()}`;
}

// Colors match actual drink appearance — first match wins
const DRINK_COLORS: [string, string][] = [
  ["dirty matcha", "bg-[#6b7a45] text-white"],       // brownish green (matcha + espresso)
  ["matcha spanish", "bg-[#8fbc6b] text-black"],      // milky pale green
  ["matcha", "bg-[#5da832] text-white"],              // bright matcha green
  ["caramel none coffee", "bg-[#e8c98a] text-black"], // light creamy caramel
  ["honey citrus coffee", "bg-[#c8922a] text-white"], // golden brown (honey + coffee)
  ["honey citrus", "bg-[#eab932] text-black"],        // golden yellow honey
  ["hot caramel", "bg-[#8b5e3c] text-white"],         // warm brown caramel
  ["hot spanish oat", "bg-[#c9a87c] text-black"],     // creamy tan
  ["caramel latte", "bg-[#a67b5b] text-white"],       // warm caramel brown
  ["spanish", "bg-[#d4b896] text-black"],             // creamy condensed milk tan
  ["americano", "bg-[#3b2f2f] text-white"],           // near-black coffee
  ["oat", "bg-[#b8956a] text-white"],                 // light brown oat milk latte
  ["latte", "bg-[#8b6f4e] text-white"],               // medium brown latte
];

export function getDrinkColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of DRINK_COLORS) {
    if (lower.includes(key)) return color;
  }
  return "bg-slate-600";
}

const SHORT_NAMES: [string, string][] = [
  ["Iced Dirty Matcha Latte", "Dirty Matcha"],
  ["Matcha Spanish Latte", "Matcha Spanish"],
  ["Matcha Latte", "Matcha"],
  ["Iced Caramel None Coffee", "Caramel NC"],
  ["Iced Honey Citrus Coffee", "Honey Coffee"],
  ["Honey Citrus", "Honey Citrus"],
  ["Hot Caramel Latte", "Hot Caramel"],
  ["Iced Caramel Latte", "Caramel"],
  ["Iced Spanish Latte", "Spanish"],
  ["Hot Americano", "Americano"],
  ["Hot Oat Latte", "Hot Oat"],
  ["Hot Spanish Oat Latte", "Hot Spanish Oat"],
  ["Iced Latte Oat", "Oat Latte"],
];

export function getShortName(name: string): string {
  for (const [full, short] of SHORT_NAMES) {
    if (name === full) return short;
  }
  return name;
}

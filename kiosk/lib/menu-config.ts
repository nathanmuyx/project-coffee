import { MenuItem } from "./types";
import { getDrinkColor } from "./utils";

// Groups hot/iced variants of the same drink into one display card.
// `iced`/`hot` must match exact DB menu_item names.
// `single` for drinks with no variant.
const DRINK_GROUPS: {
  name: string;
  image: string;
  iced?: string;
  hot?: string;
  single?: string;
}[] = [
  { name: "Oat Latte", image: "oat-latte", iced: "Iced Latte Oat", hot: "Hot Oat Latte" },
  { name: "Caramel Latte", image: "caramel-latte", iced: "Iced Caramel Latte", hot: "Hot Caramel Latte" },
  { name: "Spanish Oat Latte", image: "spanish-oat-latte", iced: "Iced Spanish Latte", hot: "Hot Spanish Oat Latte" },
  { name: "Americano", image: "americano", single: "Hot Americano" },
  { name: "Honey Citrus", image: "honey-citrus", single: "Honey Citrus" },
  { name: "Honey Citrus Coffee", image: "honey-citrus-coffee", single: "Iced Honey Citrus Coffee" },
  { name: "Caramel (Non-Coffee)", image: "caramel-nc", single: "Iced Caramel None Coffee" },
  { name: "Matcha Latte", image: "matcha-latte", single: "Matcha Latte" },
  { name: "Dirty Matcha", image: "dirty-matcha", single: "Iced Dirty Matcha Latte" },
  { name: "Matcha Spanish", image: "matcha-spanish", single: "Matcha Spanish Latte" },
];

export interface DisplayDrink {
  name: string;
  image: string;
  color: string;
  price: number;
  variants: { label: string; menuItem: MenuItem }[];
}

export function buildDisplayMenu(items: MenuItem[]): DisplayDrink[] {
  const byName = new Map(items.map((i) => [i.name, i]));
  const used = new Set<string>();
  const result: DisplayDrink[] = [];

  for (const group of DRINK_GROUPS) {
    const variants: { label: string; menuItem: MenuItem }[] = [];

    if (group.single) {
      const item = byName.get(group.single);
      if (item) {
        variants.push({ label: "", menuItem: item });
        used.add(group.single);
      }
    } else {
      if (group.iced) {
        const item = byName.get(group.iced);
        if (item) {
          variants.push({ label: "Iced", menuItem: item });
          used.add(group.iced);
        }
      }
      if (group.hot) {
        const item = byName.get(group.hot);
        if (item) {
          variants.push({ label: "Hot", menuItem: item });
          used.add(group.hot);
        }
      }
    }

    if (variants.length > 0) {
      result.push({
        name: group.name,
        image: `/drinks/${group.image}.png`,
        color: getDrinkColor(variants[0].menuItem.name),
        price: Math.min(...variants.map((v) => v.menuItem.price)),
        variants,
      });
    }
  }

  // Any remaining items not in a group
  for (const item of items) {
    if (!used.has(item.name)) {
      const slug = item.name.toLowerCase().replace(/\s+/g, "-");
      result.push({
        name: item.name,
        image: `/drinks/${slug}.png`,
        color: getDrinkColor(item.name),
        price: item.price,
        variants: [{ label: "", menuItem: item }],
      });
    }
  }

  return result;
}

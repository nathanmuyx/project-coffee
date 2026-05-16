import { MenuItem } from "./types";
import { getDrinkColor } from "./utils";

export interface DisplayDrink {
  name: string;
  image: string;
  color: string;
  price: number;
  variants: { label: string; menuItem: MenuItem }[];
}

// Buckets menu_items by display_group. Items with null display_group render
// as their own card. Variant order within a group follows sort_order, then
// display_label alphabetically (so "Hot" / "Iced" stay stable).
export function buildDisplayMenu(items: MenuItem[]): DisplayDrink[] {
  const buckets = new Map<string, MenuItem[]>();
  const order: string[] = []; // bucket key insertion order = first-seen sort_order

  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);

  for (const item of sorted) {
    const key = item.display_group ?? `__solo_${item.id}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }

  return order.map((key) => {
    const variants = buckets.get(key)!.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return (a.display_label ?? "").localeCompare(b.display_label ?? "");
    });
    const first = variants[0];
    const groupName = first.display_group ?? first.name;
    const dbImage = variants.find((v) => v.image_url)?.image_url;
    const fallbackSlug = groupName.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, "-");

    return {
      name: groupName,
      image: dbImage ?? `/drinks/${fallbackSlug}.png`,
      color: getDrinkColor(first.name),
      price: Math.max(...variants.map((v) => v.price)),
      variants: variants.map((v) => ({
        label: v.display_label ?? "",
        menuItem: v,
      })),
    };
  });
}

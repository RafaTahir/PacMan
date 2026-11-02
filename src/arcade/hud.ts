import type { HudItem } from "./shared/contracts";

/** Keep survival resources prominent; every other field remains in the details. */
export function partitionHud(items: readonly HudItem[]): { primary: HudItem[]; details: HudItem[] } {
  const priority = (item: HudItem) => item.kind === "health" ? 0 : item.kind === "energy" ? 1 : item.kind === "combo" ? 2 : 3;
  const ranked = items.map((item, index) => ({ item, index })).sort((a, b) => priority(a.item) - priority(b.item) || a.index - b.index);
  const selected = ranked.slice(0, 3);
  const indices = new Set(selected.map(({ index }) => index));
  return { primary: selected.map(({ item }) => item), details: items.filter((_, index) => !indices.has(index)) };
}

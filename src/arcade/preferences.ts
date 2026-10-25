export const store = {
  get(name: string): string | null { try { return localStorage.getItem(`afterhours.arcade.${name}`); } catch { return null; } },
  set(name: string, value: string): void { try { localStorage.setItem(`afterhours.arcade.${name}`, value); } catch { /* Optional device persistence. */ } },
};
const legacy = (name: string): string | null => { try { return localStorage.getItem(`afterhours.pacman.${name}`); } catch { return null; } };
const motion = store.get("motion") ?? legacy("motion");
export const preference = {
  muted: store.get("muted") === null ? legacy("sound") === "off" : store.get("muted") === "true",
  reducedMotion: motion === "reduced" || (motion === null && matchMedia("(prefers-reduced-motion: reduce)").matches),
  highContrast: (store.get("contrast") ?? legacy("contrast")) === "high",
};
export function localBest(id: string): number {
  let legacy = 0;
  if (id === "pacman") try { legacy = Number(localStorage.getItem("afterhours.pacman.best")) || 0; } catch { /* Optional device storage. */ }
  return Math.max(0, legacy, Number(store.get(`best.${id}`)) || 0);
}
export function saveBest(id: string, score: number): number {
  const best = Math.max(localBest(id), score);
  store.set(`best.${id}`, String(best));
  return best;
}

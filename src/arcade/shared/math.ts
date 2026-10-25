export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
export function axis(value: number): number {
  return Number.isFinite(value) ? clamp(Math.round(value), -127, 127) : 0;
}
export function normalize(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  return length > 1e-8 ? { x: x / length, y: y / length } : { x: 0, y: -1 };
}

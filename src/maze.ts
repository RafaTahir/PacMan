import type { GhostMode } from "./types";

export const COLS = 28;
export const ROWS = 31;

// The arcade playfield, with the off-board gutters retained for the tunnel.
// Dots, power pellets and the house door are data, not inferred from artwork.
export const MAZE: string[] = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "     #.##### ## #####.#     ",
  "     #.##          ##.#     ",
  "     #.## ###--### ##.#     ",
  "######.## #      # ##.######",
  "      .   #      #   .      ",
  "######.## #      # ##.######",
  "     #.## ######## ##.#     ",
  "     #.##          ##.#     ",
  "     #.## ######## ##.#     ",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......  .......##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

export const key = (x: number, y: number): number => y * COLS + x;

export function tileAt(x: number, y: number): string {
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= ROWS)
    return "#";
  if (y === 14) x = ((x % COLS) + COLS) % COLS;
  return MAZE[y]?.[x] ?? "#";
}

export function isWalkable(
  x: number,
  y: number,
  actor?: GhostMode | "pacman" | "ghost",
): boolean {
  const tile = tileAt(x, y);
  if (tile === "#") return false;
  if (tile === "-")
    return actor === "eyes" || actor === "leaving" || actor === "house";
  // The blank gutters around the maze are not corridors.
  if (y !== 14 && y >= 9 && y <= 19 && (x < 6 || x > 21)) return false;
  return true;
}

export function initialPellets(): {
  pellets: Set<number>;
  energizers: Set<number>;
} {
  const pellets = new Set<number>();
  const energizers = new Set<number>();
  MAZE.forEach((row, y) =>
    [...row].forEach((tile, x) => {
      if (tile === ".") pellets.add(key(x, y));
      if (tile === "o") energizers.add(key(x, y));
    }),
  );
  return { pellets, energizers };
}

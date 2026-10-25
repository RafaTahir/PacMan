import type { FruitKind } from "./types";

export const TICK_RATE = 60.60606060606061;
export const TICK_SECONDS = 1 / TICK_RATE;
// A speed of 100% is 1.25 pixels per video frame; a tile is eight pixels.
export const BASE_SPEED = (1.25 * TICK_RATE) / 8;

export interface LevelConfig {
  pacmanSpeed: number;
  poweredPacmanSpeed: number;
  ghostSpeed: number;
  frightenedSpeed: number;
  tunnelSpeed: number;
  frightenedSeconds: number;
  frightenedFlashes: number;
  elroyDots: readonly [number, number];
  elroySpeeds: readonly [number, number];
  releaseLimits: readonly [number, number, number];
  releaseTimeout: number;
}

const FRIGHT_SECONDS = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];

export function getLevelConfig(level: number): LevelConfig {
  level = Math.max(1, Math.floor(level));
  const early = level === 1;
  const middle = level >= 2 && level <= 4;
  const elroy =
    level === 1
      ? 20
      : level === 2
        ? 30
        : level <= 5
          ? 40
          : level <= 8
            ? 50
            : level <= 11
              ? 60
              : level <= 14
                ? 80
                : level <= 18
                  ? 100
                  : 120;
  const frightenedSeconds = FRIGHT_SECONDS[level - 1] ?? 0;
  return {
    pacmanSpeed: early ? 0.8 : middle || level >= 21 ? 0.9 : 1,
    poweredPacmanSpeed: early ? 0.9 : middle ? 0.95 : level >= 21 ? 0.9 : 1,
    ghostSpeed: early ? 0.75 : middle ? 0.85 : 0.95,
    frightenedSpeed: early ? 0.5 : middle ? 0.55 : 0.6,
    tunnelSpeed: early ? 0.4 : middle ? 0.45 : 0.5,
    frightenedSeconds,
    frightenedFlashes:
      frightenedSeconds === 0
        ? 0
        : level >= 9 && ![10, 11, 14].includes(level)
          ? 3
          : 5,
    elroyDots: [elroy, elroy / 2],
    elroySpeeds: early ? [0.8, 0.85] : middle ? [0.9, 0.95] : [1, 1.05],
    releaseLimits: early ? [0, 30, 60] : level === 2 ? [0, 0, 50] : [0, 0, 0],
    releaseTimeout: level <= 4 ? 4 : 3,
  };
}

// These are nominal seconds (60 original timing ticks per second). The tiny
// fourth scatter period on later boards is exactly one video frame.
export function scatterSchedule(level: number): readonly number[] {
  if (level === 1) return [7, 20, 7, 20, 5, 20, 5, Infinity];
  if (level <= 4) return [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity];
  return [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity];
}

export function fruitForLevel(level: number): {
  kind: FruitKind;
  points: number;
} {
  if (level === 1) return { kind: "cherry", points: 100 };
  if (level === 2) return { kind: "strawberry", points: 300 };
  if (level <= 4) return { kind: "orange", points: 500 };
  if (level <= 6) return { kind: "apple", points: 700 };
  if (level <= 8) return { kind: "melon", points: 1000 };
  if (level <= 10) return { kind: "galaxian", points: 2000 };
  if (level <= 12) return { kind: "bell", points: 3000 };
  return { kind: "key", points: 5000 };
}

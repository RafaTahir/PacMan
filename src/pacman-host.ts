import { Game } from "./engine";
import { TICK_SECONDS } from "./levels";
import { ReplayRecorder } from "./arcade/replay";
import type { Direction } from "./types";
import type { ReplayInput } from "./arcade/shared/contracts";

export const PACMAN_BRIDGE = "afterhours:pacman:v1";
export const PACMAN_MAX_TICKS = Math.floor(120 / TICK_SECONDS);
export interface PacmanSettings { muted: boolean; reducedMotion: boolean; highContrast: boolean }
export interface PacmanHud { score: number; level: number; lives: number; remaining: number; frames: number; paused: boolean; phase: string }
export interface PacmanFinished { score: number; frames: number; inputs: ReplayInput[]; victory: boolean }
export type HostCommand =
  | { type: "hello" }
  | { type: "start"; session: number; mode: "ranked" | "practice"; seed?: number; maxTicks?: number; paused?: boolean }
  | { type: "pause" | "toggle-pause" | "help" | "dispose" }
  | { type: "settings"; settings: PacmanSettings };
export type ChildMessage =
  | { type: "ready" }
  | { type: "status"; session: number; phase: string; hud: PacmanHud; countdown?: number }
  | { type: "finished"; session: number; result: PacmanFinished }
  | { type: "restart" | "menu" | "fullscreen"; session: number };

const DIRECTIONS: Record<Direction, readonly [number, number]> = {
  left: [-127, 0], right: [127, 0], up: [0, -127], down: [0, 127],
};

/** One engine tick at a time. It never drains the UI's event queue. */
export class PacmanRankedSession {
  readonly game: Game;
  readonly recorder = new ReplayRecorder();
  readonly maxTicks: number;
  private accumulator = 0;
  private delivered = false;

  constructor(readonly seed: number, maxTicks = PACMAN_MAX_TICKS, highScore = 0) {
    this.maxTicks = Math.min(PACMAN_MAX_TICKS, Math.max(1, Math.floor(maxTicks)));
    this.game = new Game({ seed, highScore });
    this.game.start();
  }

  get ended(): boolean { return this.game.state.phase === "game-over" || this.game.state.frame >= this.maxTicks; }
  resetClock(): void { this.accumulator = 0; }

  input(direction: Direction): void {
    if (this.ended || !DIRECTIONS[direction]) return;
    const [x, y] = DIRECTIONS[direction];
    // Event frame N is applied before the future engine tick N+1, exactly as on the verifier.
    this.game.input(direction);
    this.recorder.record(this.game.state.frame, { x, y, aimX: 0, aimY: 0, buttons: 0 });
  }

  advance(delta: number): number {
    if (this.ended || this.game.state.paused || !Number.isFinite(delta) || delta <= 0) {
      this.accumulator = 0;
      return 0;
    }
    this.accumulator += delta;
    const before = this.game.state.frame;
    while (this.accumulator + 1e-10 >= TICK_SECONDS && !this.ended && !this.game.state.paused) {
      this.accumulator = Math.max(0, this.accumulator - TICK_SECONDS);
      this.game.update(TICK_SECONDS);
    }
    if (this.ended) this.accumulator = 0;
    return this.game.state.frame - before;
  }

  finish(): PacmanFinished | null {
    if (!this.ended || this.delivered) return null;
    this.delivered = true;
    return { score: this.game.state.score, frames: this.game.state.frame,
      inputs: this.recorder.snapshot().filter(([tick]) => tick < this.game.state.frame),
      victory: this.game.state.phase !== "game-over" };
  }
}

export function isBridgeEnvelope(value: unknown): value is { channel: typeof PACMAN_BRIDGE; type: string; [key: string]: unknown } {
  return !!value && typeof value === "object" && (value as { channel?: unknown }).channel === PACMAN_BRIDGE && typeof (value as { type?: unknown }).type === "string";
}

export function isPacmanHud(value: unknown): value is PacmanHud {
  if (!value || typeof value !== "object") return false;
  const hud = value as PacmanHud;
  return [hud.score, hud.level, hud.lives, hud.remaining, hud.frames].every(number => Number.isSafeInteger(number) && number >= 0) &&
    hud.level >= 1 && hud.remaining <= 244 && typeof hud.paused === "boolean" &&
    ["title", "ready", "playing", "dying", "level-clear", "game-over"].includes(hud.phase);
}

/** Defense in depth for the display bridge; score verification still happens on D1's server. */
export function isPacmanFinished(value: unknown, maxTicks: number | null): value is PacmanFinished {
  if (!value || typeof value !== "object") return false;
  const result = value as PacmanFinished;
  if (!Number.isSafeInteger(result.score) || result.score < 0 || !Number.isSafeInteger(result.frames) || result.frames < 1 ||
    (maxTicks !== null && result.frames > maxTicks) || typeof result.victory !== "boolean" || !Array.isArray(result.inputs) ||
    result.inputs.length > Math.min(result.frames + 1, PACMAN_MAX_TICKS + 1)) return false;
  let previous = -1;
  for (const row of result.inputs) {
    if (!Array.isArray(row) || row.length !== 6 || !row.every(Number.isInteger)) return false;
    const [tick, x, y, aimX, aimY, buttons] = row;
    if (tick <= previous || tick < 0 || tick >= result.frames || ![-127, 0, 127].includes(x) || ![-127, 0, 127].includes(y) ||
      (x !== 0 && y !== 0) || aimX !== 0 || aimY !== 0 || buttons !== 0) return false;
    previous = tick;
  }
  return true;
}

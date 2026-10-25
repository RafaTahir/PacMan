import { getLevelConfig } from "./levels";
import type { Direction, GameState } from "./types";

/** Presentation-only clock: the Game stays paused for the entire countdown. */
export class ResumeCountdown {
  private remaining = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  get seconds(): number {
    return Math.ceil(this.remaining);
  }

  start(): void {
    this.remaining = 3;
  }

  cancel(): void {
    this.remaining = 0;
  }

  /** True only on completion. Hidden pages cancel instead of silently resuming. */
  advance(delta: number, visible = true): boolean {
    if (!visible) {
      this.cancel();
      return false;
    }
    if (!this.active || !Number.isFinite(delta) || delta <= 0) return false;
    this.remaining = Math.max(0, this.remaining - delta);
    if (this.remaining < 1e-9) this.remaining = 0;
    return !this.active;
  }
}

const ARROWS: Record<Direction, string> = {
  up: "↑", left: "←", down: "↓", right: "→",
};

export function queuedTurn(state: Pick<GameState, "phase" | "pacman">) {
  if (!["ready", "playing"].includes(state.phase) ||
      state.pacman.nextDir === state.pacman.dir) return null;
  return {
    direction: state.pacman.nextDir,
    arrow: ARROWS[state.pacman.nextDir],
    label: `Direction queued ${state.pacman.nextDir}. A turn happens when legal; reversing is immediate.`,
  };
}

/** Read the engine clock; never start an independent power timer. */
export function powerCue(state: Pick<GameState,
  "phase" | "level" | "frightenedRemaining" | "ghosts">) {
  if (state.phase !== "playing" || state.frightenedRemaining <= 0) return null;
  const duration = getLevelConfig(state.level).frightenedSeconds;
  if (duration <= 0) return null;
  const seconds = Math.ceil(state.frightenedRemaining);
  const ending = state.frightenedRemaining <= 2;
  const edibleCount = state.ghosts.filter(ghost => ghost.mode === "frightened").length;
  return {
    seconds,
    ending,
    edibleCount,
    progress: Math.max(0, Math.min(1, state.frightenedRemaining / duration)),
    text: edibleCount === 0
      ? `BLUE ${seconds}s · NONE OUT`
      : ending ? `BLUE ENDS ${seconds}s` : `BLUE GHOSTS ${seconds}s`,
    label: `${seconds} seconds of blue time remain. ${edibleCount} roaming ${edibleCount === 1 ? "ghost is" : "ghosts are"} edible. Other ghosts remain dangerous.`,
  };
}

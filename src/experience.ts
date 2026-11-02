import { getLevelConfig, TICK_RATE } from "./levels";
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


/** Presentation only: state remains authoritative and countdowns never mutate it. */
export function relayCue(state: Pick<GameState, "relay" | "frame" | "phase">) {
  const r = state.relay;
  if (!r || state.phase === "title" || state.phase === "game-over") return null;
  const positions = ["upper left", "upper right", "lower right", "lower left"];
  const directions = ["NW", "NE", "SE", "SW"];
  const seconds = r.deadline ? Math.max(0, Math.ceil((r.deadline - state.frame) / TICK_RATE)) : null;
  const protection = r.ward ? "Ward ready: absorbs one hit." : r.graceUntil > state.frame ? "Ward absorbed a hit: brief escape protection active." : "No ward.";
  const message = r.messageUntil > state.frame ? r.message : "";
  return {
    text: `LINK ${r.collected}/4 · ${directions[r.target]}${seconds === null ? "" : ` · ${seconds}s`}${r.ward ? " · WARD" : r.graceUntil > state.frame ? " · SAFE" : ""}`,
    label: `Relay ${r.collected} of 4. Next beacon: ${positions[r.target]}.${seconds === null ? "" : ` ${seconds} seconds remain.`} ${protection} Dot flow ${r.streak}. Circuits completed ${r.circuits}.`,
    message,
  };
}

/** Announce each distinct model message once; ticking and pauses stay quiet. */
export class RelayAnnouncements {
  private seen = new WeakMap<NonNullable<GameState["relay"]>, string>();
  next(state: Pick<GameState, "relay" | "frame" | "phase" | "paused">): string | null {
    if (state.paused || state.phase !== "playing" || !state.relay) return null;
    const cue = relayCue(state);
    if (!cue?.message) return null;
    const key = state.relay.message;
    if (this.seen.get(state.relay) === key) return null;
    this.seen.set(state.relay, key);
    return `${cue.message}. ${cue.label}`;
  }
}

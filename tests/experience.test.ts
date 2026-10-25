import { describe, expect, it } from "vitest";
import { Game } from "../src/engine";
import { powerCue, queuedTurn, ResumeCountdown } from "../src/experience";
import { TICK_SECONDS } from "../src/levels";
import type { Direction, GameState, Ghost, Phase } from "../src/types";

function playingGame(seed = 1980): Game {
  const game = new Game({ seed });
  game.start();
  game.update(122 * TICK_SECONDS);
  expect(game.state.phase).toBe("playing");
  game.drainEvents();
  return game;
}

function placePacman(game: Game, x: number, y: number, dir: Direction): void {
  // Movement destinations belong to the actor object; replace it for a fixture.
  game.state.pacman = { x, y, dir, nextDir: dir, moving: true };
}

function ghost(mode: Ghost["mode"], frightenedVisual = false): Ghost {
  return {
    id: "blinky", x: 13, y: 11, dir: "left", moving: true,
    mode, frightenedVisual, target: { x: 13, y: 11 },
  };
}

function poweredState(
  overrides: Partial<Pick<GameState, "phase" | "level" | "frightenedRemaining" | "ghosts">> = {},
): Pick<GameState, "phase" | "level" | "frightenedRemaining" | "ghosts"> {
  return {
    phase: "playing", level: 1, frightenedRemaining: 4,
    ghosts: [ghost("frightened")], ...overrides,
  };
}

describe("resume countdown", () => {
  it("keeps the full three-second gate and reports completion exactly once", () => {
    const countdown = new ResumeCountdown();
    expect(countdown.active).toBe(false);
    expect(countdown.seconds).toBe(0);
    expect(countdown.advance(1)).toBe(false);
    countdown.start();
    expect(countdown.seconds).toBe(3);
    expect(countdown.advance(1)).toBe(false);
    expect(countdown.seconds).toBe(2);
    expect(countdown.advance(1)).toBe(false);
    expect(countdown.seconds).toBe(1);
    expect(countdown.advance(0.99)).toBe(false);
    expect(countdown.active).toBe(true);
    expect(countdown.advance(0.01)).toBe(true);
    expect(countdown.active).toBe(false);
    expect(countdown.seconds).toBe(0);
    expect(countdown.advance(10)).toBe(false);
  });

  it("handles a long visible frame without repeated completion", () => {
    const countdown = new ResumeCountdown();
    countdown.start();
    expect(countdown.advance(8)).toBe(true);
    expect(countdown.seconds).toBe(0);
    expect(countdown.advance(8)).toBe(false);
  });

  it("cancels and restarts with a fresh three seconds", () => {
    const countdown = new ResumeCountdown();
    countdown.start();
    countdown.advance(2.5);
    countdown.cancel();
    expect(countdown.active).toBe(false);
    expect(countdown.advance(1)).toBe(false);
    countdown.start();
    expect(countdown.seconds).toBe(3);
    expect(countdown.advance(1)).toBe(false);
    countdown.start();
    expect(countdown.seconds).toBe(3);
    expect(countdown.advance(2.99)).toBe(false);
    expect(countdown.advance(0.01)).toBe(true);
  });

  it("cancels in the background without completing or resuming on return", () => {
    const countdown = new ResumeCountdown();
    countdown.start();
    countdown.advance(2.9);
    expect(countdown.advance(60, false)).toBe(false);
    expect(countdown.active).toBe(false);
    expect(countdown.seconds).toBe(0);
    expect(countdown.advance(60, true)).toBe(false);
    countdown.start();
    expect(countdown.advance(0, false)).toBe(false);
    expect(countdown.active).toBe(false);
  });

  it("ignores invalid and nonpositive deltas without shortening the gate", () => {
    const countdown = new ResumeCountdown();
    countdown.start();
    for (const delta of [NaN, Infinity, -Infinity, -1, 0]) {
      expect(countdown.advance(delta)).toBe(false);
      expect(countdown.seconds).toBe(3);
      expect(countdown.active).toBe(true);
    }
    expect(countdown.advance(2.99)).toBe(false);
    expect(countdown.advance(0.01)).toBe(true);
  });

  it("never advances the paused engine or changes a queued input", () => {
    const game = playingGame();
    game.togglePause();
    game.input("up");
    const before = structuredClone(game.state);
    const countdown = new ResumeCountdown();
    countdown.start();
    for (let frame = 0; frame < 181; frame++) {
      countdown.advance(1 / 60);
      game.update(1 / 60);
    }
    expect(countdown.active).toBe(false);
    expect(game.state).toEqual(before);
    expect(game.state.paused).toBe(true);
    expect(game.state.pacman.nextDir).toBe("up");
    expect(game.drainEvents()).toEqual([]);
    countdown.start();
    countdown.advance(100, false);
    expect(game.state).toEqual(before);
  });
});

describe("queued turn cue", () => {
  it.each([
    ["up", "↑"], ["left", "←"], ["down", "↓"], ["right", "→"],
  ] as const)("shows the requested %s direction rather than current movement", (direction, arrow) => {
    const state = new Game().state;
    state.phase = "playing";
    state.pacman.dir = direction === "left" ? "up" : "left";
    state.pacman.nextDir = direction;
    expect(queuedTurn(state)).toMatchObject({ direction, arrow });
    expect(queuedTurn(state)?.label).toContain(`queued ${direction}`);
  });

  it("removes the cue once the requested turn becomes current movement", () => {
    const state = new Game().state;
    state.phase = "playing";
    state.pacman.nextDir = "up";
    expect(queuedTurn(state)?.direction).toBe("up");
    state.pacman.dir = "up";
    expect(queuedTurn(state)).toBeNull();
  });

  it.each(["ready", "playing"] as const)("supports a queued turn during %s", (phase) => {
    const state = new Game().state;
    state.phase = phase;
    state.pacman.nextDir = "up";
    expect(queuedTurn(state)?.direction).toBe("up");
  });

  it.each(["title", "dying", "level-clear", "game-over"] as Phase[])("hides stale input during %s", (phase) => {
    const state = new Game().state;
    state.phase = phase;
    state.pacman.nextDir = "up";
    expect(queuedTurn(state)).toBeNull();
  });
});

describe("power cue", () => {
  it("counts edible ghosts by actual mode, excluding revived normal and blue house ghosts", () => {
    const state = poweredState({
      ghosts: [ghost("frightened"), ghost("normal"), ghost("house", true), ghost("eyes")],
    });
    const cue = powerCue(state);
    expect(cue).toMatchObject({ seconds: 4, ending: false, edibleCount: 1 });
    expect(cue?.label).toContain("1 roaming ghost is edible");
    expect(cue?.label).toContain("Other ghosts remain dangerous");
  });

  it.each(["normal", "eyes", "house", "leaving"] as const)("does not treat a %s ghost's blue visual flag as edible", (mode) => {
    const cue = powerCue(poweredState({ ghosts: [ghost(mode, true)] }));
    expect(cue?.edibleCount).toBe(0);
    expect(cue?.text).toContain("NONE OUT");
  });

  it("provides a static expiry warning through the last partial second", () => {
    const state = poweredState({ frightenedRemaining: 2.01 });
    expect(powerCue(state)).toMatchObject({ seconds: 3, ending: false });
    state.frightenedRemaining = 2;
    expect(powerCue(state)).toMatchObject({ seconds: 2, ending: true });
    expect(powerCue(state)?.text).toContain("BLUE ENDS");
    state.frightenedRemaining = 0.01;
    expect(powerCue(state)).toMatchObject({ seconds: 1, ending: true });
    state.frightenedRemaining = 0;
    expect(powerCue(state)).toBeNull();
    state.frightenedRemaining = -0.01;
    expect(powerCue(state)).toBeNull();
  });

  it.each(["title", "ready", "dying", "level-clear", "game-over"] as Phase[])("hides leftover power state during %s", (phase) => {
    expect(powerCue(poweredState({ phase }))).toBeNull();
  });

  it("reads a fresh energizer extension from the engine rather than its own timer", () => {
    const game = playingGame();
    placePacman(game, 1, 3, "up");
    game.update(TICK_SECONDS);
    const initial = powerCue(game.state);
    expect(initial?.seconds).toBe(6);
    placePacman(game, 1, 1, "right");
    game.update(60 * TICK_SECONDS);
    const elapsed = powerCue(game.state);
    expect(elapsed?.seconds).toBe(5);
    expect(elapsed!.progress).toBeLessThan(initial!.progress);
    placePacman(game, 26, 3, "up");
    game.update(TICK_SECONDS);
    const extended = powerCue(game.state);
    expect(extended?.seconds).toBe(6);
    expect(extended!.progress).toBeGreaterThan(elapsed!.progress);
    expect(game.drainEvents().filter((event) => event.type === "energizer")).toHaveLength(2);
  });

  it("uses the current level's short power duration and bounds the visual progress", () => {
    expect(powerCue(poweredState({ level: 18, frightenedRemaining: 0.75 }))).toMatchObject({
      seconds: 1, ending: true, progress: 0.75,
    });
    expect(powerCue(poweredState({ level: 18, frightenedRemaining: 2 }))?.progress).toBe(1);
  });

  it("does not promise edible time after a zero-duration level energizer", () => {
    const game = playingGame();
    game.state.level = 17;
    placePacman(game, 1, 3, "up");
    game.update(TICK_SECONDS);
    expect(game.drainEvents()).toContainEqual({ type: "energizer" });
    expect(game.state.frightenedRemaining).toBe(0);
    expect(powerCue(game.state)).toBeNull();
    expect(game.state.ghosts.some((actor) => actor.mode === "frightened")).toBe(false);
    expect(powerCue(poweredState({ level: 17 }))).toBeNull();
  });
});

describe("presentation purity", () => {
  it("does not mutate frozen actor state when cues are repeatedly inspected", () => {
    const state = playingGame().state;
    state.pacman.nextDir = "up";
    state.frightenedRemaining = 1.5;
    state.ghosts[0].mode = "frightened";
    const before = structuredClone(state);
    for (const actor of [state.pacman, ...state.ghosts]) Object.freeze(actor);
    Object.freeze(state.ghosts);
    Object.freeze(state);
    for (let read = 0; read < 10; read++) {
      expect(queuedTurn(state)?.direction).toBe("up");
      expect(powerCue(state)?.edibleCount).toBe(1);
    }
    expect(state).toEqual(before);
  });

  it("preserves seeded simulation and every event batch with cues enabled or disabled", () => {
    const observed = playingGame(12345);
    const reference = playingGame(12345);
    for (const game of [observed, reference]) placePacman(game, 1, 3, "up");
    let poweredReads = 0;
    let energizers = 0;
    const directions: Direction[] = ["up", "left", "down", "right"];
    for (let tick = 0; tick < 500; tick++) {
      if (tick % 30 === 0) {
        const direction = directions[Math.floor(tick / 30) % directions.length];
        observed.input(direction);
        reference.input(direction);
      }
      queuedTurn(observed.state);
      powerCue(observed.state);
      observed.update(TICK_SECONDS);
      reference.update(TICK_SECONDS);
      if (powerCue(observed.state)) poweredReads++;
      queuedTurn(observed.state);
      const events = observed.drainEvents();
      energizers += events.filter((event) => event.type === "energizer").length;
      expect(events).toEqual(reference.drainEvents());
      expect(observed.state).toEqual(reference.state);
    }
    expect(energizers).toBeGreaterThan(0);
    expect(poweredReads).toBeGreaterThan(30);
  });
});

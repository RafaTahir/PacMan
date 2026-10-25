import { describe, expect, it } from "vitest";
import { Game } from "../src/engine";
import { TICK_SECONDS } from "../src/levels";
import { PACMAN_MAX_TICKS, PacmanRankedSession, isPacmanFinished } from "../src/pacman-host";
import { replayScore, runLimits, validateReplay } from "../server/replay";
import type { Direction } from "../src/types";
import { isWalkable, key } from "../src/maze";

/** Legal queued turns only: no actor edits, protection or engine shortcuts. */
function chooseSafeTurn(session: PacmanRankedSession): void {
  const state = session.game.state;
  const vectors: Record<Direction, readonly [number, number]> = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
  const opposite: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };
  const blocked = new Set<number>();
  for (const ghost of state.ghosts) if (ghost.mode === "normal") {
    const x = Math.round(ghost.x), y = Math.round(ghost.y);
    blocked.add(key(x, y));
    for (const [dx, dy] of Object.values(vectors)) blocked.add(key(x + dx, y + dy));
  }
  const x = Math.round(state.pacman.x), y = Math.round(state.pacman.y);
  const queue: { x: number; y: number; first: Direction | null }[] = [{ x, y, first: null }];
  const seen = new Set([key(x, y)]);
  for (let index = 0; index < queue.length && index < 500; index++) {
    const current = queue[index];
    if (current.first && (state.pellets.has(key(current.x, current.y)) || state.energizers.has(key(current.x, current.y)))) {
      session.input(current.first);
      return;
    }
    for (const direction of Object.keys(vectors) as Direction[]) {
      if (index === 0 && direction === opposite[state.pacman.dir]) continue;
      const [dx, dy] = vectors[direction];
      const nextX = (current.x + dx + 28) % 28, nextY = current.y + dy, tile = key(nextX, nextY);
      if (!seen.has(tile) && !blocked.has(tile) && isWalkable(nextX, nextY, "pacman")) {
        seen.add(tile);
        queue.push({ x: nextX, y: nextY, first: current.first ?? direction });
      }
    }
  }
  session.input(opposite[state.pacman.dir]);
}

describe("Pac-Man ranked child clock and recorder", () => {
  it("records accepted turns before their future tick and coalesces multiple turns in one frame", () => {
    const session = new PacmanRankedSession(1980);
    session.input("left");
    session.input("up");
    session.input("right");
    expect(session.game.state.pacman.nextDir).toBe("right");
    expect(session.recorder.snapshot()).toEqual([[0, 127, 0, 0, 0, 0]]);
    session.advance(TICK_SECONDS);
    session.input("right");
    session.input("down");
    session.input("up");
    expect(session.recorder.snapshot()).toEqual([[0, 127, 0, 0, 0, 0], [1, 0, -127, 0, 0, 0]]);
    expect(() => validateReplay("pacman", 2, session.recorder.snapshot())).not.toThrow();
  });

  it("leaves the existing event consumer in sole control of the queue", () => {
    const session = new PacmanRankedSession(17);
    session.advance(2.1);
    const events = session.game.drainEvents();
    expect(events.some(event => event.type === "start")).toBe(true);
    expect(events.some(event => event.type === "ready")).toBe(true);
    expect(session.game.drainEvents()).toEqual([]);
  });

  it("keeps a queued countdown turn without advancing a paused simulation or banking hidden time", () => {
    const session = new PacmanRankedSession(42);
    session.advance(2.1);
    session.game.togglePause();
    session.resetClock();
    const frame = session.game.state.frame;
    session.input("down"); // UI accepts direction changes during its three-second countdown.
    expect(session.advance(200)).toBe(0);
    expect(session.game.state.frame).toBe(frame);
    expect(session.game.state.pacman.nextDir).toBe("down");
    session.game.togglePause();
    expect(session.advance(TICK_SECONDS)).toBe(1);
    expect(session.game.state.frame).toBe(frame + 1);
    expect(session.recorder.snapshot().at(-1)?.[0]).toBe(frame);
  });

  it("matches the real server replay for seeded input and stops on the first terminal frame", () => {
    const seed = 0x1234abcd;
    const session = new PacmanRankedSession(seed);
    const directions: Direction[] = ["up", "left", "down", "right"];
    while (!session.ended) {
      if (session.game.state.frame % 71 === 0) session.input(directions[Math.floor(session.game.state.frame / 71) % 4]);
      session.advance(TICK_SECONDS);
    }
    const result = session.finish()!;
    expect(result.frames).toBeLessThanOrEqual(runLimits("pacman").maxTicks);
    const validated = validateReplay("pacman", result.frames, result.inputs);
    expect(replayScore("pacman", seed, validated.frames, validated.inputs)).toBe(result.score);
    expect(isPacmanFinished(result, PACMAN_MAX_TICKS)).toBe(true);
    const snapshot = JSON.stringify(session.game.state);
    session.advance(10_000);
    session.input("right");
    expect(JSON.stringify(session.game.state)).toBe(snapshot);
    expect(session.finish()).toBeNull();
    if (!result.victory && result.frames < PACMAN_MAX_TICKS) {
      expect(() => replayScore("pacman", seed, result.frames + 1, result.inputs)).toThrow(/after the game ended/);
    }
  });

  it("does not overshoot the first game-over tick when a visible frame contains several ticks", () => {
    const seed = 77;
    const reference = new Game({ seed });
    reference.start();
    while (reference.state.phase !== "game-over" && reference.state.frame < PACMAN_MAX_TICKS) reference.update(TICK_SECONDS);
    const session = new PacmanRankedSession(seed);
    session.advance(1000);
    expect(session.game.state.frame).toBe(reference.state.frame);
    expect(session.game.state.phase).toBe(reference.state.phase);
    const result = session.finish()!;
    expect(replayScore("pacman", seed, result.frames, result.inputs)).toBe(result.score);
  });

  it("verifies a genuine full 7272-frame race through a level transition at the exact two-minute cap", () => {
    const session = new PacmanRankedSession(1);
    while (!session.ended) {
      if (session.game.state.frame % 4 === 0) chooseSafeTurn(session);
      session.advance(TICK_SECONDS);
    }
    const result = session.finish()!;
    expect(result.frames).toBe(7272);
    expect(result.victory).toBe(true);
    expect(session.game.state.level).toBeGreaterThan(1);
    expect(session.game.state.lives).toBeGreaterThan(0);
    const validated = validateReplay("pacman", result.frames, result.inputs);
    expect(replayScore("pacman", 1, validated.frames, validated.inputs)).toBe(result.score);
    expect(result.score).toBeGreaterThan(5000);
  });

  it("caps an arbitrary long render delta at the exact engine limit and starts a clean new identity", () => {
    const short = new PacmanRankedSession(101, 123);
    short.input("up");
    expect(short.advance(1000)).toBe(123);
    expect(short.game.state.frame).toBe(123);
    expect(short.finish()?.victory).toBe(true);
    expect(short.advance(1)).toBe(0);
    const fresh = new PacmanRankedSession(202);
    expect(fresh.seed).toBe(202);
    expect(fresh.game.state.frame).toBe(0);
    expect(fresh.recorder.snapshot()).toEqual([]);
    expect(fresh.game).not.toBe(short.game);
    expect(PACMAN_MAX_TICKS).toBe(7272);
    expect(PACMAN_MAX_TICKS).toBe(runLimits("pacman").maxTicks);
  });

  it("rejects malformed child result payloads before displaying them", () => {
    const good = { score: 120, frames: 10, inputs: [[0, -127, 0, 0, 0, 0]], victory: false };
    expect(isPacmanFinished(good, 7272)).toBe(true);
    expect(isPacmanFinished({ ...good, frames: 7273 }, 7272)).toBe(false);
    expect(isPacmanFinished({ ...good, score: Number.NaN }, 7272)).toBe(false);
    expect(isPacmanFinished({ ...good, inputs: [[0, -127, 127, 0, 0, 0]] }, 7272)).toBe(false);
    expect(isPacmanFinished({ ...good, inputs: [[10, -127, 0, 0, 0, 0]] }, 7272)).toBe(false);
    expect(isPacmanFinished({ ...good, inputs: [[0, -127, 0, 0, 0, 1]] }, 7272)).toBe(false);
  });
});

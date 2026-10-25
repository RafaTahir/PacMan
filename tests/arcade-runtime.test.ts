import { describe, expect, it, vi } from "vitest";
import { Buttons, MAX_TICKS, NEUTRAL_INPUT, type ArcadeInput, type ArcadeSimulation } from "../src/arcade/shared/contracts";
import { createSimulation as rally, MAX_ENTITIES, MAX_EFFECTS } from "../src/arcade/games/neon-rally/model";
import { createSimulation as reactor, LIMITS as REACTOR_LIMITS } from "../src/arcade/games/reactor-breaker/model";
import { createSimulation as siege, LIMITS as SIEGE_LIMITS } from "../src/arcade/games/chrome-siege/model";
import { createSimulation as pinball } from "../src/arcade/games/midnight-pinball/model";
import { ReplayRecorder } from "../src/arcade/replay";
import { validateReplay } from "../server/replay";

type Factory = (seed: number) => ArcadeSimulation;
const games: { id: string; create: Factory; limits: Record<string, number> }[] = [
  { id: "neon-rally", create: rally, limits: { entities: MAX_ENTITIES, effects: MAX_EFFECTS } },
  { id: "reactor-breaker", create: reactor, limits: REACTOR_LIMITS },
  { id: "chrome-siege", create: siege, limits: { enemies: SIEGE_LIMITS.enemies, bullets: SIEGE_LIMITS.playerShots + SIEGE_LIMITS.enemyShots,
    pickups: SIEGE_LIMITS.pickups, effects: SIEGE_LIMITS.effects } },
  { id: "midnight-pinball", create: pinball, limits: { balls: 3 } },
];

// Replay inputs use only the public wire format and a separate integer generator.
// No model state is changed or inspected to choose an advantageous move.
function traceInput(tick: number, seed: number): Readonly<ArcadeInput> {
  let value = (Math.imul(tick + 1, 1664525) + seed + 1013904223) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  return Object.freeze({
    x: (value & 255) % 255 - 127,
    y: ((value >>> 8) & 255) % 255 - 127,
    aimX: ((value >>> 16) & 255) % 255 - 127,
    aimY: ((value >>> 24) & 255) % 255 - 127,
    buttons: (tick % 120 < 83 ? Buttons.PRIMARY : 0)
      | (tick % 181 < 70 ? Buttons.SECONDARY : 0)
      | (tick % 240 < 65 ? Buttons.LAUNCH : 0)
      | (tick % 420 < 200 ? Buttons.POINTER : 0),
  });
}

function finiteNumbers(value: unknown, path = "state"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} is not finite: ${value}`);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) finiteNumbers(child, `${path}.${key}`);
  }
}

function resourceBounds(simulation: ArcadeSimulation, limits: Record<string, number>): void {
  const state = simulation.state as unknown as Record<string, unknown>;
  for (const [key, limit] of Object.entries(limits)) {
    const collection = state[key];
    if (Array.isArray(collection) && collection.length > limit) throw new Error(`${key} exceeded ${limit}: ${collection.length}`);
  }
  if (Array.isArray(state.bullets)) {
    const hostile = state.bullets.filter((bullet: { hostile: boolean }) => bullet.hostile).length;
    if (hostile > SIEGE_LIMITS.enemyShots || state.bullets.length - hostile > SIEGE_LIMITS.playerShots) {
      throw new Error("Projectile ownership caps exceeded");
    }
  }
}

describe.each(games)("$id shared replay and runtime contract", ({ create, limits }) => {
  it.each([1, 0xabcdef12])("replays seed %i with identical state and events within bounded resources", (seed) => {
    // The server imports these exact factories. Clock/random access here would
    // turn browser scores into replay failures even if rendering looked correct.
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Unseeded simulation randomness"); });
    const clock = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("Wall-clock simulation dependency"); });
    try {
      const first = create(seed), second = create(seed);
      let previousScore = 0;
      for (let tick = 0; tick < MAX_TICKS; tick++) {
        const input = traceInput(tick, seed);
        const left = first.step(input), right = second.step(input);
        expect(left).toEqual(right);
        resourceBounds(first, limits);
        if (first.state.score < previousScore || !Number.isSafeInteger(first.state.score)) throw new Error("Score must be a nonnegative, monotonic safe integer");
        previousScore = first.state.score;
        if (tick % 180 === 0 || first.state.status !== "playing") {
          expect(first.state).toEqual(second.state);
          finiteNumbers(first.state);
        }
        if (first.state.status !== "playing") break;
      }
      expect(first.state.tick).toBeGreaterThan(0);
      expect(first.state.tick).toBeLessThanOrEqual(MAX_TICKS);
      expect(["gameover", "victory"]).toContain(first.state.status);
      const terminal = JSON.stringify(first.state);
      for (let tick = 0; tick < 30; tick++) expect(first.step(traceInput(tick, seed))).toEqual([]);
      expect(JSON.stringify(first.state)).toBe(terminal);
    } finally {
      random.mockRestore();
      clock.mockRestore();
    }
  }, 20_000);

  it("ends a neutral-input run by the common two-minute limit", () => {
    const simulation = create(1980);
    const neutral = Object.freeze({ ...NEUTRAL_INPUT });
    for (let tick = 0; tick < MAX_TICKS; tick++) {
      simulation.step(neutral);
      resourceBounds(simulation, limits);
      if (simulation.state.status !== "playing") break;
    }
    expect(simulation.state.tick).toBeGreaterThan(0);
    expect(simulation.state.tick).toBeLessThanOrEqual(MAX_TICKS);
    expect(simulation.state.status).not.toBe("playing");
    finiteNumbers(simulation.state);
  }, 20_000);
});

describe("browser recorder and server replay contract", () => {
  it("submits an idle run and a changed-input run in the verifier's accepted wire format", () => {
    for (const active of [false, true]) {
      const recorder = new ReplayRecorder();
      for (let tick = 0; tick < 120; tick++) {
        recorder.record(tick, active && tick >= 30 && tick < 90
          ? { ...NEUTRAL_INPUT, x: 127, buttons: Buttons.PRIMARY }
          : NEUTRAL_INPUT);
      }
      expect(() => validateReplay("chrome-siege", 120, recorder.snapshot())).not.toThrow();
      expect(recorder.inputs.length).toBeLessThanOrEqual(2);
    }
  });
});

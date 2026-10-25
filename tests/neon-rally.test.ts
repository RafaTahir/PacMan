import { describe, expect, it } from "vitest";
import { Buttons, MAX_TICKS, NEUTRAL_INPUT, type ArcadeInput } from "../src/arcade/shared/contracts";
import { LANES, MAX_EFFECTS, MAX_ENTITIES, MAX_SCORE, PLAYER_HALF_WIDTH, ROAD_HALF_WIDTH, comboMultiplier, createSimulation, makeEntity, type RallySimulation } from "../src/arcade/games/neon-rally/model";

const input = (x = 0, y = 0, buttons = 0): ArcadeInput => ({ ...NEUTRAL_INPUT, x, y, buttons });

function clearRoad(seed = 704): RallySimulation {
  const simulation = createSimulation(seed);
  simulation.state.entities = [];
  simulation.state.spawnCooldown = MAX_TICKS + 10;
  simulation.state.hazardCooldown = MAX_TICKS + 10;
  simulation.state.cellCooldown = MAX_TICKS + 10;
  return simulation;
}

function tick(simulation: RallySimulation, count: number, controls = input()): void {
  for (let index = 0; index < count; index++) simulation.step(controls);
}

/** Arrange an actual vehicle pass, exercising overlap sampling and pass detection. */
function pass(simulation: RallySimulation, gap: number): void {
  simulation.state.entities = [makeEntity(simulation.state.nextId++, "sedan", PLAYER_HALF_WIDTH + 1.68 / 2 + gap, 0)];
  for (let count = 0; count < 45 && !simulation.state.entities[0]?.scored; count++) simulation.step(input());
}

describe("Neon Rally driving model", () => {
  it("steers with inertia, then naturally damps lateral movement after release", () => {
    const simulation = clearRoad();
    tick(simulation, 35, input(127));
    const { x, velocityX } = simulation.state.player;
    expect(x).toBeGreaterThan(1.8);
    expect(velocityX).toBeGreaterThan(4.5);
    tick(simulation, 1);
    expect(simulation.state.player.x).toBeGreaterThan(x);
    expect(simulation.state.player.velocityX).toBeGreaterThan(0);
    expect(simulation.state.player.velocityX).toBeLessThan(velocityX);
    tick(simulation, 60);
    expect(simulation.state.player.velocityX).toBeLessThan(0.02);
  });

  it("handbrake changes grip and speed, and banks a controlled slide on release", () => {
    const normal = clearRoad();
    const drift = clearRoad();
    normal.state.player.x = drift.state.player.x = -3;
    drift.state.player.nitro = 20;
    tick(normal, 40, input(127));
    tick(drift, 40, input(127, 0, Buttons.SECONDARY));
    expect(drift.state.player.velocityX).toBeGreaterThan(normal.state.player.velocityX + 2);
    expect(drift.state.player.speed).toBeLessThan(normal.state.player.speed);
    expect(drift.state.player.drifting).toBe(true);
    expect(drift.state.player.driftCharge).toBeGreaterThan(0.6);
    const signals = drift.step(input());
    expect(drift.state.driftScore).toBeGreaterThan(60);
    expect(drift.state.player.nitro).toBeGreaterThan(25);
    expect(drift.state.player.driftCharge).toBe(0);
    expect(signals.some((signal) => signal.type === "score")).toBe(true);
  });

  it("nitro spends energy for speed, locks an empty tank, and yields to the handbrake", () => {
    const normal = clearRoad();
    const boost = clearRoad();
    tick(normal, 120);
    tick(boost, 120, input(0, 0, Buttons.PRIMARY));
    expect(boost.state.player.speed).toBeGreaterThan(normal.state.player.speed + 10);
    expect(boost.state.distance).toBeGreaterThan(normal.state.distance + 15);
    expect(boost.state.player.nitro).toBeLessThan(12);
    tick(boost, 35, input(0, 0, Buttons.PRIMARY));
    expect(boost.state.player.boostLocked).toBe(true);
    expect(boost.state.player.boosting).toBe(false);
    tick(boost, 1, input(0, 0, Buttons.PRIMARY | Buttons.SECONDARY));
    expect(boost.state.player.boosting).toBe(false);
    expect(boost.state.player.drifting).toBe(true);
  });

  it("bounds the driving plane and makes a guardrail strike cost armor", () => {
    const simulation = clearRoad();
    tick(simulation, 200, input(127));
    expect(Math.abs(simulation.state.player.x)).toBeLessThan(ROAD_HALF_WIDTH - PLAYER_HALF_WIDTH);
    expect(simulation.state.player.health).toBeLessThan(100);
    expect(simulation.state.collisions).toBeGreaterThan(0);
  });

  it("normalizes non-finite and out-of-range axes before driving", () => {
    const bounded = clearRoad();
    const unbounded = clearRoad();
    tick(bounded, 30, input(127, -127));
    tick(unbounded, 30, input(80_000, -80_000));
    expect(unbounded.state).toEqual(bounded.state);
    const neutral = clearRoad();
    const invalid = clearRoad();
    neutral.step(input());
    invalid.step(input(Number.NaN, Number.POSITIVE_INFINITY));
    expect(invalid.state).toEqual(neutral.state);
  });
});

describe("Neon Rally risk, damage and recovery", () => {
  it("rewards a real close overtake once and triples a chain into a multiplier", () => {
    const simulation = clearRoad();
    simulation.state.player.nitro = 0;
    pass(simulation, 0.4);
    expect(simulation.state.nearMisses).toBe(1);
    expect(simulation.state.combo).toBe(1);
    expect(simulation.state.overtakes).toBe(1);
    expect(simulation.state.score).toBeGreaterThanOrEqual(165);
    expect(simulation.state.player.nitro).toBeGreaterThan(11);
    tick(simulation, 20);
    expect(simulation.state.nearMisses).toBe(1);
    pass(simulation, 0.4);
    pass(simulation, 0.1);
    expect(simulation.state.combo).toBe(3);
    expect(comboMultiplier(simulation.state.combo)).toBe(2);
    expect(simulation.state.bestCombo).toBe(3);
    expect(simulation.state.callout?.label).toBe("DANGEROUS");
    expect(simulation.state.callout?.value).toBe(460);
    tick(simulation, 301);
    expect(simulation.state.combo).toBe(0);
    expect(simulation.state.bestCombo).toBe(3);
  });

  it("cannot turn a collision into a near miss and invulnerability prevents repeat damage", () => {
    const simulation = clearRoad();
    simulation.state.combo = 7;
    simulation.state.comboTicks = 200;
    simulation.state.entities = [makeEntity(90, "sedan", 0, 1)];
    const first = simulation.step(input());
    expect(simulation.state.player.health).toBe(68);
    expect(simulation.state.combo).toBe(0);
    expect(first).toContainEqual({ type: "hit", value: 32 });
    tick(simulation, 35);
    expect(simulation.state.player.health).toBe(68);
    expect(simulation.state.nearMisses).toBe(0);
    simulation.state.entities.push(makeEntity(91, "truck", simulation.state.player.x, 0));
    simulation.step(input());
    expect(simulation.state.player.health).toBe(68);
  });

  it("uses armor, grants recovery after losing a car, and ends the last car's run", () => {
    const simulation = clearRoad();
    simulation.state.player.health = 10;
    simulation.state.entities = [makeEntity(90, "truck", 0, 1)];
    const recovery = simulation.step(input());
    expect(simulation.state.lives).toBe(2);
    expect(simulation.state.player.health).toBe(100);
    expect(simulation.state.player.invulnerable).toBe(180);
    expect(recovery).toContainEqual({ type: "death", value: 2 });
    expect(simulation.state.status).toBe("playing");
    simulation.state.lives = 1;
    simulation.state.player.health = 10;
    simulation.state.player.invulnerable = 0;
    simulation.state.entities = [makeEntity(91, "barrier", simulation.state.player.x, 1)];
    const fatal = simulation.step(input());
    expect(simulation.state.lives).toBe(0);
    expect(simulation.state.status).toBe("gameover");
    expect(fatal.some((signal) => signal.type === "lose")).toBe(true);
    const snapshot = JSON.stringify(simulation.state);
    expect(simulation.step(input(127, -127, Buttons.PRIMARY))).toEqual([]);
    expect(JSON.stringify(simulation.state)).toBe(snapshot);
  });

  it("oil changes grip without hidden armor damage; green cells repair and refill", () => {
    const simulation = clearRoad();
    simulation.state.combo = 3;
    simulation.state.comboTicks = 180;
    simulation.state.entities = [makeEntity(90, "oil", -0.1, 1)];
    simulation.step(input());
    expect(simulation.state.player.oilTicks).toBe(110);
    expect(simulation.state.player.health).toBe(100);
    expect(simulation.state.player.velocityX).toBeGreaterThan(3);
    expect(simulation.state.combo).toBe(0);
    simulation.state.player.health = 43;
    simulation.state.player.nitro = 20;
    simulation.state.entities = [makeEntity(91, "cell", simulation.state.player.x, 0)];
    const signals = simulation.step(input());
    expect(simulation.state.player.health).toBe(65);
    expect(simulation.state.player.nitro).toBeGreaterThanOrEqual(55);
    expect(signals).toContainEqual({ type: "upgrade", value: 22 });
  });

  it("checkpoints restore resources and advance the district; fractional chain timers expire", () => {
    const simulation = clearRoad();
    simulation.state.tick = 1799;
    simulation.state.player.health = 50;
    simulation.state.player.nitro = 10;
    simulation.state.combo = 8;
    simulation.state.comboTicks = 0.4;
    simulation.step(input());
    expect(simulation.state.district).toBe(1);
    expect(simulation.state.player.health).toBe(68);
    expect(simulation.state.player.nitro).toBeGreaterThanOrEqual(32);
    expect(simulation.state.score).toBeGreaterThanOrEqual(500);
    expect(simulation.state.combo).toBe(0);
  });
});

describe("Neon Rally ranked replays", () => {
  it("can finish a whole race with ordinary steering, armor and traffic rules", () => {
    const simulation = createSimulation(1);
    let target = 0;
    while (simulation.state.status === "playing") {
      const state = simulation.state;
      const player = state.player;
      if (state.tick % 10 === 0) {
        let best = Number.POSITIVE_INFINITY;
        for (const lane of LANES) {
          let cost = Math.abs(lane - player.x) * 0.12 + Math.abs(lane - target) * 0.07;
          for (const entity of state.entities) {
            if (entity.hit || entity.kind === "cell") continue;
            const time = entity.distance / (player.speed - entity.speed);
            const gap = Math.abs(lane - entity.x) - PLAYER_HALF_WIDTH - entity.width / 2;
            if (time > -0.25 && time < 2.6 && gap < 0.3) cost += (2.7 - Math.max(0, time)) * 8 + (gap < 0 ? 8 : 0);
          }
          if (cost < best) { best = cost; target = lane; }
        }
      }
      const steer = Math.max(-127, Math.min(127, Math.round((target - player.x) * 85 - player.velocityX * 26)));
      simulation.step(input(steer, -50));
    }
    expect(simulation.state.status).toBe("victory");
    expect(simulation.state.tick).toBe(MAX_TICKS);
    expect(simulation.state.lives).toBeGreaterThan(0);
    expect(simulation.state.collisions).toBeGreaterThan(0);
    expect(simulation.state.nearMisses).toBeGreaterThan(0);
    expect(simulation.state.score).toBeGreaterThan(15_000);
  });

  it("replays 7200 input ticks identically with bounded entities, effects and score", () => {
    const left = createSimulation(0xdecafbad);
    const right = createSimulation(0xdecafbad);
    // Armor protection allows this endurance fixture to observe every spawning tier.
    left.state.player.invulnerable = right.state.player.invulnerable = MAX_TICKS + 1;
    let trafficPeak = 0;
    let sawRoadworks = false;
    let sawOil = false;
    let sawRepair = false;
    let sawDenseWave = false;
    for (let index = 0; index < MAX_TICKS; index++) {
      const x = Math.floor(index / 90) % 2 === 0 ? 38 : -38;
      const buttons = index % 360 < 80 ? Buttons.PRIMARY : index % 360 > 260 ? Buttons.SECONDARY : 0;
      const controls = input(x, index % 500 < 120 ? -50 : 0, buttons);
      expect(left.step(controls)).toEqual(right.step(controls));
      trafficPeak = Math.max(trafficPeak, left.state.entities.length);
      sawRoadworks ||= left.state.entities.some((entity) => entity.kind === "barrier");
      sawOil ||= left.state.entities.some((entity) => entity.kind === "oil");
      sawRepair ||= left.state.entities.some((entity) => entity.kind === "cell");
      sawDenseWave ||= left.state.district === 3 && left.state.entities.length >= 10;
      expect(left.state.entities.length).toBeLessThanOrEqual(MAX_ENTITIES);
      expect(left.state.effects.length).toBeLessThanOrEqual(MAX_EFFECTS);
      expect(Number.isFinite(left.state.player.x + left.state.player.velocityX + left.state.distance + left.state.score)).toBe(true);
    }
    expect(left.state).toEqual(right.state);
    expect(left.state.tick).toBe(7200);
    expect(left.state.status).toBe("victory");
    expect(left.state.district).toBe(3);
    expect(left.state.score).toBeGreaterThan(8_000);
    expect(left.state.score).toBeLessThanOrEqual(MAX_SCORE);
    expect(trafficPeak).toBeGreaterThan(8);
    expect(sawRoadworks && sawOil && sawRepair && sawDenseWave).toBe(true);
    const snapshot = JSON.stringify(left.state);
    tick(left, 120, input(127, -127, Buttons.PRIMARY));
    expect(JSON.stringify(left.state)).toBe(snapshot);
  });

  it("a fresh factory resets a run exactly, and different seeds change traffic", () => {
    const initial = createSimulation(81);
    const played = createSimulation(81);
    tick(played, 900, input(-40, -70, Buttons.PRIMARY));
    expect(played.state.tick).toBeGreaterThan(0);
    expect(createSimulation(81).state).toEqual(initial.state);
    expect(createSimulation(82).state.entities).not.toEqual(initial.state.entities);
    expect(initial.state.score).toBe(0);
    expect(initial.state.lives).toBe(3);
    expect(initial.state.status).toBe("playing");
  });

  it("enforces the score ceiling and ends at the exact time cap", () => {
    const simulation = clearRoad();
    simulation.state.score = MAX_SCORE - 1;
    simulation.state.tick = MAX_TICKS - 1;
    simulation.state.district = 3;
    const signals = simulation.step(input());
    expect(simulation.state.tick).toBe(MAX_TICKS);
    expect(simulation.state.status).toBe("victory");
    expect(simulation.state.score).toBe(MAX_SCORE);
    expect(signals).toContainEqual({ type: "win", value: MAX_SCORE });
  });
});

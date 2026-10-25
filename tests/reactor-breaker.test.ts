import { describe, expect, it } from "vitest";
import { Buttons, MAX_TICKS, NEUTRAL_INPUT, type ArcadeInput, type ArcadeSimulation } from "../src/arcade/shared/contracts";
import { BOARD, LIMITS, createSimulation, sweepCircleAabb, type Ball, type ReactorState, type Tower, type TowerKind } from "../src/arcade/games/reactor-breaker/model";

const input = (values: Partial<ArcadeInput> = {}): ArcadeInput => ({ ...NEUTRAL_INPUT, ...values });
const tower = (id: number, x: number, y: number, kind: TowerKind = "core", layers = 2): Tower => ({ id, x, y, kind, layers, maxLayers: layers, layerHp: kind === "armored" ? 2 : 1, hp: kind === "armored" ? 2 : 1, halfWidth: 0.83, halfDepth: 0.58, flash: 0 });
const ball = (x: number, y: number, vx: number, vy: number, id = 1): Ball => ({ id, x, y, prevX: x, prevY: y, vx, vy, radius: BOARD.ballRadius, trail: [] });
const isolated = (): ArcadeSimulation<ReactorState> => {
  const simulation = createSimulation(17);
  simulation.state.towers = [tower(0, 0, 0), tower(27, 6, -7)];
  simulation.state.shield = 0;
  return simulation;
};

describe("reactor breaker continuous collisions", () => {
  it("sweeps through thin faces at velocities far beyond normal play", () => {
    const hit = sweepCircleAabb(-10, 0, 2400, 0, 0.2, 1 / 60, -0.8, -0.6, 0.8, 0.6);
    expect(hit).toEqual({ time: 9 / 2400, nx: -1, ny: 0 });
  });

  it("uses curved corner contact instead of an inflated square", () => {
    const miss = sweepCircleAabb(-1.4, -1.18, 0.6, 0, 0.2, 0.4, -1, -1, 1, 1);
    expect(miss).toBeNull();
    const corner = sweepCircleAabb(-2, -2, 10, 10, 0.2, 1, -1, -1, 1, 1);
    expect(corner).not.toBeNull();
    expect(corner!.time).toBeCloseTo((1 - Math.SQRT1_2 * 0.2) / 10);
    expect(corner!.nx).toBeCloseTo(-Math.SQRT1_2);
    expect(corner!.ny).toBeCloseTo(-Math.SQRT1_2);
  });

  it("does not collide when moving away and returns an escape normal for overlap", () => {
    expect(sweepCircleAabb(-1.2, 0, -10, 0, 0.2, 1, -1, -1, 1, 1)).toBeNull();
    expect(sweepCircleAabb(-1.1, 0, 10, 0, 0.2, 1, -1, -1, 1, 1)).toEqual({ time: 0, nx: -1, ny: 0 });
  });

  it("reflects a fast ball and damages the stack without tunneling", () => {
    const simulation = isolated();
    simulation.state.balls = [ball(-4, 0, 600, 0)];
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.towers[0].layers).toBe(1);
    expect(simulation.state.balls[0].x).toBeLessThan(-1);
    expect(Math.abs(simulation.state.balls[0].x)).toBeLessThan(BOARD.halfWidth);
    expect(simulation.state.score).toBeGreaterThan(0);
  });

  it("steers center and edge returns, with meaningful moving-paddle spin", () => {
    const returnAt = (x: number, movement = 0) => {
      const simulation = isolated();
      simulation.state.balls = [ball(x, 7.9, 0, 12)];
      simulation.step(input({ x: movement }));
      return simulation.state.balls[0];
    };
    const left = returnAt(-1.1), center = returnAt(0), right = returnAt(1.1), spin = returnAt(14 / 60, 127);
    expect(left.vx).toBeLessThan(-6); expect(right.vx).toBeGreaterThan(6);
    expect(center.vx).toBeCloseTo(0); expect(spin.vx).toBeGreaterThan(1);
    for (const returned of [left, center, right, spin]) { expect(returned.vy).toBeLessThan(-3); expect(Math.hypot(returned.vx, returned.vy)).toBeCloseTo(10, 1); }
  });

  it("keeps simultaneous wall and corner contacts finite", () => {
    const simulation = isolated();
    simulation.state.balls = [ball(7.78, -9.28, 36, -36)];
    for (let tick = 0; tick < 30; tick++) simulation.step(NEUTRAL_INPUT);
    for (const value of Object.values(simulation.state.balls[0]).filter(value => typeof value === "number")) expect(Number.isFinite(value)).toBe(true);
    expect(simulation.state.balls[0].x).toBeGreaterThanOrEqual(-7.801);
    expect(simulation.state.balls[0].x).toBeLessThanOrEqual(7.801);
    expect(simulation.state.balls[0].y).toBeGreaterThanOrEqual(-9.301);
  });
});

describe("reactor stacks, powers and run progression", () => {
  it("starts with a complete seeded, layered 28-tower sector", () => {
    const simulation = createSimulation(712);
    expect(simulation.state.towers).toHaveLength(28);
    expect(new Set(simulation.state.towers.map(tower => tower.id)).size).toBe(28);
    expect(new Set(simulation.state.towers.map(tower => tower.kind)).size).toBe(4);
    expect(simulation.state.towers.some(tower => tower.layers > 1)).toBe(true);
    expect(simulation.state.lives).toBe(3);
    expect(simulation.state.shield).toBe(1);
    simulation.step(input({ buttons: Buttons.PRIMARY }));
    expect(simulation.state.balls).toHaveLength(1);
    expect(simulation.state.balls[0].vy).toBeLessThan(0);
  });

  it("clamps malformed axes and moves pointer targets at a bounded speed", () => {
    const simulation = createSimulation(1);
    simulation.step(input({ x: Number.NaN }));
    expect(simulation.state.paddle.x).toBe(0);
    simulation.step(input({ x: 100000 }));
    expect(simulation.state.paddle.x).toBeCloseTo(14 / 60);
    simulation.step(input({ aimX: -127, buttons: Buttons.POINTER }));
    expect(simulation.state.paddle.x).toBeCloseTo(14 / 60 - 18 / 60);
    for (let i = 0; i < 200; i++) simulation.step(input({ x: 127 }));
    expect(simulation.state.paddle.x).toBeLessThan(BOARD.halfWidth - simulation.state.paddle.halfWidth);
  });

  it("requires two contacts per armored layer and exposes the next layer", () => {
    const simulation = isolated();
    simulation.state.towers[0] = tower(0, 0, 0, "armored", 3);
    simulation.state.balls = [ball(0, 1.05, 0, -30)];
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.towers[0]).toMatchObject({ layers: 3, hp: 1 });
    simulation.state.balls = [ball(0, 1.05, 0, -30)];
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.towers[0]).toMatchObject({ layers: 2, hp: 2 });
    expect(simulation.state.layersBroken).toBe(1);
  });

  it("propagates volatile chain reactions across adjacent stacks exactly once", () => {
    const simulation = isolated();
    simulation.state.towers = [tower(0, 0, 0, "volatile", 1), tower(1, 2.08, 0, "volatile", 1), tower(2, 4.16, 0, "core", 2), tower(3, -6, -7, "core", 3)];
    simulation.state.balls = [ball(0, 1.05, 0, -30)];
    const signals = simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.towers.map(tower => tower.layers)).toEqual([0, 0, 0, 3]);
    expect(signals).toContainEqual({ type: "chain", value: 2 });
    expect(simulation.state.layersBroken).toBe(4);
    expect(simulation.state.combo).toBe(4);
    expect(simulation.state.bursts).toHaveLength(2);
  });

  it("charges and releases a pulse, then consumes it on a damaging area hit", () => {
    const simulation = isolated();
    simulation.state.energy = 100;
    simulation.state.towers = [tower(0, 0, 0, "core", 4), tower(1, 2.08, 0, "core", 3), tower(2, 6, -7, "core", 3)];
    for (let tick = 0; tick < 45; tick++) simulation.step(input({ buttons: Buttons.SECONDARY }));
    expect(simulation.state.pulseCharge).toBe(45);
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.pulseStrength).toBe(2);
    expect(simulation.state.energy).toBeLessThan(46);
    simulation.state.balls = [ball(0, 1.05, 0, -30)];
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.towers.map(tower => tower.layers)).toEqual([0, 1, 3]);
    expect(simulation.state.pulseArmed).toBe(0);
    expect(simulation.state.pulseStrength).toBe(0);
  });

  it("auto releases a full hold once and never spends charge with insufficient energy", () => {
    const simulation = isolated();
    simulation.state.energy = 100;
    for (let tick = 0; tick < 180; tick++) simulation.step(input({ buttons: Buttons.SECONDARY }));
    expect(simulation.state.pulseArmed).toBeGreaterThan(0);
    expect(simulation.state.energy).toBeGreaterThan(45);
    expect(simulation.state.pulseCharge).toBe(0);
    const empty = isolated(); empty.state.energy = 0;
    for (let tick = 0; tick < 12; tick++) empty.step(input({ buttons: Buttons.SECONDARY }));
    empty.step(NEUTRAL_INPUT);
    expect(empty.state.pulseArmed).toBe(0);
    expect(empty.state.energy).toBeLessThan(1);
  });

  it("drops a capacitor upgrade and applies wide, multiball and field catches", () => {
    const simulation = isolated();
    simulation.state.towers[0] = tower(0, 0, 0, "capacitor", 1);
    simulation.state.balls = [ball(0, 1.05, 0, -30)];
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.drops).toHaveLength(1);
    expect(simulation.state.energy).toBeGreaterThan(65);
    simulation.state.drops = [{ id: 200, x: 0, y: BOARD.paddleY - 0.1, kind: "wide", age: 0 }, { id: 201, x: 0, y: BOARD.paddleY - 0.1, kind: "multiball", age: 0 }, { id: 202, x: 0, y: BOARD.paddleY - 0.1, kind: "shield", age: 0 }];
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.wideTicks).toBe(900);
    expect(simulation.state.balls).toHaveLength(3);
    expect(simulation.state.shield).toBe(1);
    expect(simulation.state.drops).toHaveLength(0);
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.paddle.halfWidth).toBe(2.05);
  });

  it("catches a falling ball with the safety field before consuming a life", () => {
    const simulation = isolated();
    simulation.state.shield = 1;
    simulation.state.balls = [ball(5, 9.9, 0, 15)];
    const caught = simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.balls[0].vy).toBeLessThan(0);
    expect(simulation.state.shield).toBe(0);
    expect(simulation.state.lives).toBe(3);
    expect(caught.some(signal => signal.type === "near-miss")).toBe(true);
    simulation.state.balls = [ball(5, 11, 0, 15)];
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.lives).toBe(2);
    expect(simulation.state.balls).toHaveLength(0);
    expect(simulation.state.serveTicks).toBe(45);
    for (let tick = 0; tick < 45; tick++) simulation.step(input({ buttons: Buttons.PRIMARY }));
    expect(simulation.state.balls).toHaveLength(1);
  });

  it("keeps a life while any multiball survives and ends after the final core", () => {
    const simulation = isolated();
    simulation.state.balls = [ball(5, 11, 0, 15), ball(0, 4, 1, -10, 2)];
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.lives).toBe(3);
    expect(simulation.state.balls).toHaveLength(1);
    simulation.state.lives = 1;
    simulation.state.balls = [ball(5, 11, 0, 15)];
    const signals = simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.status).toBe("gameover");
    expect(signals.some(signal => signal.type === "lose")).toBe(true);
    const stopped = structuredClone(simulation.state);
    simulation.step(input({ buttons: 15 }));
    expect(simulation.state).toEqual(stopped);
  });

  it("advances to stronger sectors and wins after sector three", () => {
    const simulation = isolated();
    for (const tower of simulation.state.towers) tower.layers = 0;
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.stageClearTicks).toBe(72);
    expect(simulation.state.score).toBe(1000);
    for (let tick = 0; tick < 72; tick++) simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.stage).toBe(2);
    expect(simulation.state.towers).toHaveLength(28);
    expect(simulation.state.towers.some(tower => tower.layers === 3)).toBe(true);
    expect(simulation.state.shield).toBe(1);
    simulation.state.stage = 3;
    for (const tower of simulation.state.towers) tower.layers = 0;
    const signals = simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.status).toBe("victory");
    expect(simulation.state.score).toBeGreaterThan(4000);
    expect(signals.some(signal => signal.type === "win")).toBe(true);
  });

  it("resets every mutable run property when creating a fresh simulation", () => {
    const simulation = isolated();
    simulation.step(input({ buttons: Buttons.PRIMARY }));
    simulation.state.score = 10000; simulation.state.lives = 1; simulation.state.stage = 3;
    const fresh = createSimulation(17);
    expect(fresh.state).toEqual(createSimulation(17).state);
    expect(fresh.state.score).toBe(0); expect(fresh.state.tick).toBe(0); expect(fresh.state.stage).toBe(1); expect(fresh.state.lives).toBe(3);
  });
});

describe("reactor replay integrity and resource limits", () => {
  it("can clear all three sectors within a shift using only legal player inputs", () => {
    const simulation = createSimulation(3);
    const sectors = new Set<number>();
    for (let tick = 0; tick < MAX_TICKS && simulation.state.status === "playing"; tick++) {
      const state = simulation.state;
      sectors.add(state.stage);
      const lead = state.balls.filter(ball => ball.vy > 0).sort((a, b) => b.y - a.y)[0] ?? state.balls[0];
      let target = lead?.x ?? 0;
      if (lead?.vy > 0) {
        let intercept = lead.x + lead.vx * (BOARD.paddleY - 0.4 - lead.y) / lead.vy;
        while (intercept > 7.8 || intercept < -7.8) {
          if (intercept > 7.8) intercept = 15.6 - intercept;
          if (intercept < -7.8) intercept = -15.6 - intercept;
        }
        const targets = state.towers.filter(tower => tower.layers > 0).sort((a, b) => Math.abs(a.x - intercept) + Math.abs(a.y + 1) * 0.05 - Math.abs(b.x - intercept) - Math.abs(b.y + 1) * 0.05);
        const goal = targets[(Math.floor(tick / 240) % 3) % targets.length];
        const angle = goal ? Math.atan2(goal.x - intercept, BOARD.paddleY - goal.y) : 0;
        target = intercept - Math.max(-1.2, Math.min(1.2, angle / 1.07 * state.paddle.halfWidth));
      }
      const drop = state.drops.filter(drop => drop.y > 4 && drop.y < 8.5).sort((a, b) => b.y - a.y)[0];
      if (drop && (!lead || lead.y < 4)) target = drop.x;
      const aimX = Math.round(Math.max(-127, Math.min(127, target / 6.49 * 127)));
      simulation.step(input({ aimX, buttons: Buttons.PRIMARY | Buttons.POINTER | (tick % 120 < 60 ? Buttons.SECONDARY : 0) }));
    }
    expect([...sectors]).toEqual([1, 2, 3]);
    expect(simulation.state.status).toBe("victory");
    expect(simulation.state.tick).toBeLessThan(MAX_TICKS);
    expect(simulation.state.score).toBeGreaterThan(50_000);
  });

  it("runs exactly 7200 neutral ticks before time expires", () => {
    const simulation = createSimulation(901);
    for (let tick = 0; tick < MAX_TICKS - 1; tick++) simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.tick).toBe(7199); expect(simulation.state.status).toBe("playing");
    simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.tick).toBe(MAX_TICKS); expect(simulation.state.status).toBe("gameover");
    simulation.step(NEUTRAL_INPUT); expect(simulation.state.tick).toBe(MAX_TICKS);
  });

  it("replays a complete 7200-input run identically with bounded entities and scores", () => {
    const one = createSimulation(0xc0ffee), two = createSimulation(0xc0ffee);
    for (let tick = 0; tick < MAX_TICKS; tick++) {
      const lead = one.state.balls.filter(ball => ball.vy > 0).sort((a, b) => b.y - a.y)[0] ?? one.state.balls[0];
      const aimX = lead ? Math.round(Math.max(-127, Math.min(127, lead.x / 6.49 * 127))) : 0;
      const action = input({ aimX, buttons: Buttons.PRIMARY | Buttons.POINTER | (tick % 200 < 60 ? Buttons.SECONDARY : 0) });
      expect(one.step(action)).toEqual(two.step(action));
      if (tick % 120 === 0) expect(one.state).toEqual(two.state);
      expect(one.state.balls.length).toBeLessThanOrEqual(LIMITS.balls);
      expect(one.state.particles.length).toBeLessThanOrEqual(LIMITS.particles);
      expect(one.state.bursts.length).toBeLessThanOrEqual(LIMITS.bursts);
      expect(one.state.drops.length).toBeLessThanOrEqual(LIMITS.drops);
      expect(one.state.score).toBeLessThanOrEqual(LIMITS.score);
      expect(Number.isFinite(one.state.score)).toBe(true);
    }
    expect(one.state).toEqual(two.state);
    expect(one.state.score).toBeGreaterThan(0);
  }, 15_000);

  it("bounds an entire connected explosive yard and all its fragments", () => {
    const simulation = isolated();
    simulation.state.towers = Array.from({ length: 28 }, (_, id) => tower(id, (id % 7 - 3) * 2.08, Math.floor(id / 7) * -1.72, "volatile", 1));
    simulation.state.balls = [ball(0, 1.05, 0, -30)];
    const signals = simulation.step(NEUTRAL_INPUT);
    expect(simulation.state.towers.every(tower => tower.layers === 0)).toBe(true);
    expect(simulation.state.particles.length).toBeLessThanOrEqual(LIMITS.particles);
    expect(simulation.state.bursts.length).toBeLessThanOrEqual(LIMITS.bursts);
    expect(signals.length).toBeLessThanOrEqual(32);
  });
});

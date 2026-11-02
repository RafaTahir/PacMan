import { describe, it, expect } from "vitest";
import { createSimulation } from "../src/arcade/games/orbit-salvage/model";
import { MAX_TICKS, NEUTRAL_INPUT, Buttons } from "../src/arcade/shared/contracts";
const input = (overrides = {}) => ({ ...NEUTRAL_INPUT, ...overrides });
describe("Orbit Salvage", () => {
  it("replays seeded controls deterministically across changing movement/aim", () => {
    const a = createSimulation(42),
      b = createSimulation(42);
    for (let tick = 0; tick < 1800; tick++) {
      const i = input({
        x: Math.round(Math.sin(tick * 0.01) * 127),
        y: Math.round(Math.cos(tick * 0.007) * 127),
        aimX: 127,
        aimY: 0,
        buttons: tick % 180 < 70 ? Buttons.PRIMARY : Buttons.SECONDARY,
      });
      a.step(i);
      b.step(i);
    }
    expect(a.state).toEqual(b.state);
  });
  it("splits destroyed large rocks and awards score without exceeding pools", () => {
    const g = createSimulation(5);
    g.step(input());
    g.state.rocks = [{ id: 90, x: 0, y: 0, vx: 0, vy: 0, radius: 1.15, hp: 1, spin: 0, size: 2 }];
    g.state.shots = [{ x: -1.4, y: 0, vx: 22, vy: 0, life: 65 }];
    g.step(input());
    expect(g.state.kills).toBe(1);
    expect(g.state.rocks).toHaveLength(2);
    expect(g.state.rocks.every((r) => r.size === 1)).toBe(true);
    expect(g.state.score).toBe(40);
  });
  it("attracts and collects ore, then banks cargo only at a slow refinery approach", () => {
    const g = createSimulation(7);
    g.state.nextWave = 99999;
    g.state.player.x = 5;
    g.state.player.y = 0;
    g.state.ore = [{ x: 5.1, y: 0, life: 100, value: 1 }];
    g.step(input());
    expect(g.state.cargo).toBe(1);
    g.state.player.x = 0;
    g.state.player.y = 0;
    g.state.player.vx = 6;
    g.step(input());
    expect(g.state.cargo).toBe(1);
    g.state.player.vx = 0;
    g.step(input());
    expect(g.state.cargo).toBe(0);
    expect(g.state.delivered).toBe(1);
    expect(g.state.score).toBe(225);
  });
  it("protects hull with an energized shield and consumes energy", () => {
    const g = createSimulation(8);
    g.state.nextWave = 99999;
    g.state.player.invincible = 0;
    g.state.rocks = [{ id: 3, x: 0, y: 3, vx: 0, vy: 0, radius: 0.38, hp: 1, spin: 0, size: 0 }];
    g.step(input({ buttons: Buttons.SECONDARY }));
    expect(g.state.player.hull).toBe(4);
    expect(g.state.player.shield).toBeLessThan(100);
    expect(g.state.rocks).toHaveLength(0);
  });
  it("defers newly split shield fragments until the following tick", () => {
    const g = createSimulation(8);
    g.state.nextWave = 99999;
    g.state.player.invincible = 0;
    g.state.rocks = [{ id: 3, x: 0, y: 3, vx: 0, vy: 0, radius: 1.15, hp: 3, spin: 0, size: 2 }];
    g.step(input({ buttons: Buttons.SECONDARY }));
    expect(g.state.kills).toBe(1);
    expect(g.state.rocks).toHaveLength(2);
    expect(g.state.rocks.every((r) => r.size === 1)).toBe(true);
  });
  it("limits collision damage with invulnerability and terminates on hull loss", () => {
    const g = createSimulation(9);
    g.state.nextWave = 99999;
    g.state.player.invincible = 0;
    g.state.player.hull = 1;
    g.state.rocks = [{ id: 3, x: 0, y: 3, vx: 0, vy: 0, radius: 0.38, hp: 1, spin: 0, size: 0 }];
    g.step(input());
    expect(g.state.status).toBe("gameover");
    const tick = g.state.tick;
    g.step(input());
    expect(g.state.tick).toBe(tick);
  });
  it("enforces cannon overheat and cools back into firing readiness", () => {
    const g = createSimulation(3);
    g.state.nextWave = 99999;
    for (let i = 0; i < 110; i++) g.step(input({ buttons: Buttons.PRIMARY }));
    expect(g.state.player.overheated).toBe(true);
    for (let i = 0; i < 210; i++) g.step(input());
    expect(g.state.player.overheated).toBe(false);
    expect(g.state.player.heat).toBe(0);
  });
  it("ends a full shift deterministically and grants early contract victory", () => {
    const g = createSimulation(11);
    g.state.nextWave = 99999;
    g.state.tick = MAX_TICKS - 1;
    g.state.delivered = 12;
    g.step(input());
    expect(g.state.status).toBe("victory");
    const early = createSimulation(12);
    early.state.nextWave = 99999;
    early.state.delivered = 23;
    early.state.cargo = 1;
    early.state.player.y = 0;
    early.step(input());
    expect(early.state.status).toBe("victory");
    expect(early.state.score).toBeGreaterThan(7000);
  });
});

describe("Orbit recovery rigs", () => {
  it("attaches only with powered shield, releases without power, and banks a wreck once", () => {
    const g = createSimulation(1),
      s = g.state;
    s.nextWave = 99999;
    s.player.x = 0;
    s.player.y = 0;
    s.wreck = { x: 1, y: 0, vx: 0, vy: 0, towed: false, expires: 1000 };
    g.step(input());
    expect(s.wreck?.towed).toBe(false);
    g.step(input({ buttons: Buttons.SECONDARY }));
    expect(s.wreck).toBeNull();
    expect(s.recovered).toBe(1);
    expect(s.delivered).toBe(4);
    const score = s.score;
    g.step(input());
    expect(s.score).toBe(score);
    s.wreck = { x: 2, y: 3, vx: 0, vy: 0, towed: true, expires: 1000 };
    s.player.shield = 0;
    g.step(input({ buttons: Buttons.SECONDARY }));
    expect(s.wreck.towed).toBe(false);
  });
  it("detaches across wrapping edges and expires wrecks without rewards", () => {
    const g = createSimulation(1),
      s = g.state;
    s.nextWave = 99999;
    s.player.x = 13.99;
    s.player.vx = 6;
    s.player.y = 0;
    s.wreck = { x: 13, y: 0, vx: 0, vy: 0, towed: true, expires: 1000 };
    g.step(input({ buttons: Buttons.SECONDARY }));
    expect(s.wreck.towed).toBe(false);
    expect(s.player.x).toBeLessThan(-13);
    s.wreck.expires = s.tick;
    g.step(input());
    expect(s.wreck).toBeNull();
    expect(s.recovered).toBe(0);
  });
  it("installs modules at delivery thresholds, fits twin shots and preserves pool caps", () => {
    const g = createSimulation(1),
      s = g.state;
    s.nextWave = 99999;
    s.delivered = 6;
    g.step(input());
    expect(s.rig).toBe(1);
    s.delivered = 12;
    g.step(input());
    g.step(input({ buttons: Buttons.PRIMARY }));
    expect(s.rig).toBe(2);
    expect(s.shots).toHaveLength(2);
    s.delivered = 18;
    s.player.hull = 1;
    g.step(input());
    expect(s.rig).toBe(3);
    expect(s.player.hull).toBe(3);
    for (let i = 0; i < 400; i++) g.step(input({ buttons: Buttons.PRIMARY }));
    expect(s.shots.length).toBeLessThanOrEqual(34);
  });
  it("does not discard excess dense ore at capacity and lets later pickup take the remainder", () => {
    const g = createSimulation(2),
      s = g.state;
    s.nextWave = 99999;
    s.player.x = 5;
    s.player.y = 0;
    s.cargo = 11;
    s.ore = [{ x: 5, y: 0, life: 100, value: 2 }];
    g.step(input());
    expect(s.cargo).toBe(12);
    expect(s.ore[0].value).toBe(1);
    s.cargo = 10;
    g.step(input());
    expect(s.cargo).toBe(11);
    expect(s.ore).toHaveLength(0);
  });
  it("gives dense fragments richer ore and volatile blasts crack nearby armor without recursive kills", () => {
    const g = createSimulation(2),
      s = g.state;
    s.nextWave = 99999;
    s.player.x = 10;
    s.rocks = [{ id: 80, x: 0, y: 0, vx: 0, vy: 0, radius: 0.38, hp: 1, spin: 0, size: 0, composition: "dense" }];
    s.shots = [{ x: -0.65, y: 0, vx: 22, vy: 0, life: 10 }];
    g.step(input());
    expect(s.ore[0].value).toBe(2);
    s.rocks = [
      { id: 81, x: 0, y: 0, vx: 0, vy: 0, radius: 0.38, hp: 1, spin: 0, size: 0, composition: "volatile" },
      { id: 82, x: 2, y: 0, vx: 0, vy: 0, radius: 1, hp: 4, spin: 0, size: 2, composition: "dense" },
    ];
    s.shots = [{ x: -0.65, y: 0, vx: 22, vy: 0, life: 10 }];
    g.step(input());
    expect(s.rocks[0].hp).toBe(2);
    expect(s.kills).toBe(2);
  });
  it("sanitizes malformed axes and keeps cargo drag measurable", () => {
    const a = createSimulation(8),
      b = createSimulation(8);
    a.state.nextWave = b.state.nextWave = 99999;
    a.step(input({ x: NaN, y: Infinity, aimX: NaN, aimY: Infinity }));
    b.step(input());
    expect(a.state.player).toEqual(b.state.player);
    b.state.cargo = 12;
    a.step(input({ x: 127 }));
    b.step(input({ x: 127 }));
    expect(a.state.player.vx).toBeGreaterThan(b.state.player.vx);
  });
});

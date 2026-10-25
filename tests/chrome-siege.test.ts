import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Buttons, MAX_TICKS, NEUTRAL_INPUT, type ArcadeInput, type ThreeStage } from "../src/arcade/shared/contracts";
import { BOSS_TICK, DASH_COOLDOWN, DASH_DURATION, LIMITS, createSimulation, type Enemy, type EnemyKind, type SiegeState } from "../src/arcade/games/chrome-siege/model";
import { createView } from "../src/arcade/games/chrome-siege/view";

const input = (patch: Partial<ArcadeInput> = {}): ArcadeInput => ({ ...NEUTRAL_INPUT, ...patch });
function enemy(id: number, kind: EnemyKind, x: number, y: number, patch: Partial<Enemy> = {}): Enemy {
  const maxHp = kind === "boss" ? 840 : kind === "brute" ? 54 : kind === "gunner" ? 24 : 12;
  return { id, kind, x, y, hp: maxHp, maxHp, radius: kind === "boss" ? 1.35 : kind === "brute" ? .65 : .4,
    age: 0, spawnTicks: 0, cooldown: 150, chargeTicks: 0, aimX: 0, aimY: 1, phase: 1, attackIndex: 0, flash: 0, ...patch };
}
const run = (simulation: ReturnType<typeof createSimulation>, count: number, controls = input()) => {
  for (let i = 0; i < count; i++) simulation.step(controls);
};

/** A deliberately simple, replayable player: circle the arena, aim at the nearest active target,
 * collect nearby cores, and dash when a hostile closes. It uses only public input, no state edits. */
function pilot(s: SiegeState): ArcadeInput {
  const p = s.player;
  let target = s.enemies.filter(e => e.spawnTicks === 0).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const angle = s.tick * .0036;
  let destination = { x: Math.cos(angle) * 7.1, y: Math.sin(angle) * 5.1 };
  const core = s.pickups.filter(item => item.kind === "repair" && p.hp < p.maxHp || item.kind === "core")
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (core && Math.hypot(core.x - p.x, core.y - p.y) < 5 && !s.enemies.some(e => Math.hypot(e.x - core.x, e.y - core.y) < 1.8)) destination = core;
  const dx = destination.x - p.x, dy = destination.y - p.y, distance = Math.hypot(dx, dy) || 1;
  let mx = dx / distance, my = dy / distance;
  for (const e of s.enemies) {
    const ex = p.x - e.x, ey = p.y - e.y, d = Math.hypot(ex, ey);
    if (d < 2.8 && d > .01) { mx += ex / d * 2; my += ey / d * 2; }
  }
  const movement = Math.hypot(mx, my) || 1;
  const ax = target ? target.x - p.x : 0, ay = target ? target.y - p.y : -1, aim = Math.hypot(ax, ay) || 1;
  const danger = s.bullets.some(b => b.hostile && Math.hypot(b.x - p.x, b.y - p.y) < 1.3)
    || s.enemies.some(e => e.spawnTicks === 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 1.2);
  return input({ x: Math.round(mx / movement * 127), y: Math.round(my / movement * 127),
    aimX: Math.round(ax / aim * 127), aimY: Math.round(ay / aim * 127),
    buttons: Buttons.PRIMARY | (danger && p.dashCooldown === 0 && s.tick % 2 === 0 ? Buttons.SECONDARY : 0) });
}

describe("Chrome Siege deterministic combat", () => {
  it("uses normalized movement and direction aim, keeps zero aim, and fires into actual enemies", () => {
    const sim = createSimulation(14), p = sim.state.player;
    sim.step(input({ x: 127, y: 127, aimX: 127, aimY: 0, buttons: Buttons.PRIMARY }));
    expect(Math.hypot(p.x, p.y - 3)).toBeCloseTo(.085, 7);
    expect(sim.state.bullets[0].vx).toBeCloseTo(.34);
    expect(sim.state.bullets[0].vy).toBeCloseTo(0);
    sim.step(input({ aimX: 0, aimY: 0 }));
    expect(p.aimX).toBe(1);
    sim.state.enemies = [enemy(900, "drone", p.x + 2.2, p.y)];
    run(sim, 25, input({ aimX: 127, aimY: 0, buttons: Buttons.PRIMARY }));
    expect(p.kills).toBe(1);
    expect(sim.state.score).toBeGreaterThanOrEqual(100);
    expect(p.xp + sim.state.pickups.reduce((n, item) => n + item.value, 0)).toBeGreaterThanOrEqual(3);
  });

  it("dashes through contact and rounds, protects the final dash tick, and requires a fresh press after cooldown", () => {
    const sim = createSimulation(2), p = sim.state.player;
    p.invulnerable = 0;
    sim.state.enemies = [enemy(900, "drone", .31, 3)];
    sim.state.bullets = [{ id: 901, x: .2, y: 3, vx: .1, vy: 0, radius: .2, damage: 1, ttl: 60, hostile: true }];
    sim.step(input({ x: 127, buttons: Buttons.SECONDARY }));
    expect(p.hp).toBe(6); expect(p.x).toBeCloseTo(.31); expect(p.dashCooldown).toBe(DASH_COOLDOWN);
    run(sim, DASH_DURATION - 1, input({ x: 127, buttons: Buttons.SECONDARY }));
    expect(p.x).toBeCloseTo(.31 * DASH_DURATION); expect(p.dashTicks).toBe(0); expect(p.invulnerable).toBeGreaterThan(0);
    run(sim, DASH_COOLDOWN, input({ buttons: Buttons.SECONDARY }));
    expect(p.dashTicks).toBe(0); expect(p.dashCooldown).toBe(0);
    sim.step(input());
    expect(sim.step(input({ x: -127, buttons: Buttons.SECONDARY })).some(event => event.type === "dash")).toBe(true);
  });

  it("damages on enemy contact once per grace window and resets a running combo", () => {
    const sim = createSimulation(3), p = sim.state.player;
    p.invulnerable = 0; sim.state.combo = 9; sim.state.comboTicks = 100;
    const attacker = enemy(900, "drone", p.x, p.y);
    sim.state.enemies = [attacker];
    sim.step(input());
    expect(p.hp).toBe(5); expect(sim.state.combo).toBe(0);
    for (let i = 0; i < 83; i++) { attacker.x = p.x; attacker.y = p.y; sim.step(input()); }
    expect(p.hp).toBe(5);
    attacker.x = p.x; attacker.y = p.y; sim.step(input());
    expect(p.hp).toBe(4);
  });

  it("locks gunner fire and brute charges to their visible warning direction", () => {
    const sim = createSimulation(4), p = sim.state.player;
    const gunner = enemy(900, "gunner", 0, -3, { cooldown: 27 });
    sim.state.enemies = [gunner]; sim.step(input());
    expect(gunner.aimX).toBeCloseTo(0); expect(gunner.aimY).toBeCloseTo(1);
    p.x = 7; run(sim, 26);
    const shot = sim.state.bullets.find(b => b.hostile)!;
    expect(shot).toBeDefined(); expect(shot.vx).toBeCloseTo(0); expect(shot.vy).toBeGreaterThan(0);
    const brute = enemy(901, "brute", 0, -3, { cooldown: 37 });
    p.x = 0; sim.state.enemies = [brute]; sim.step(input()); p.x = 7;
    run(sim, 37);
    expect(brute.chargeTicks).toBeGreaterThan(0); expect(brute.x).toBeCloseTo(0); expect(brute.y).toBeGreaterThan(-3);
  });

  it("collects cores and repairs, applies real cannon/health/dash upgrades, and rewards chains", () => {
    const sim = createSimulation(5), p = sim.state.player;
    p.hp = 2;
    sim.state.pickups = [{ id: 900, kind: "core", x: p.x, y: p.y, value: 90, ttl: 60 }, { id: 901, kind: "repair", x: p.x, y: p.y, value: 2, ttl: 60 }];
    const signals = sim.step(input());
    expect(p.level).toBe(5); expect(p.maxHp).toBe(8); expect(p.hp).toBe(8);
    expect(signals.filter(event => event.type === "upgrade")).toHaveLength(4);
    sim.step(input({ buttons: Buttons.PRIMARY | Buttons.SECONDARY }));
    expect(sim.state.bullets.filter(b => !b.hostile)).toHaveLength(5);
    expect(sim.state.bullets[0].damage).toBe(10); expect(p.dashCooldown).toBe(120);
    sim.state.bullets = [];
    sim.state.enemies = [enemy(902, "drone", p.x + 1.5, p.y, { hp: 1 })];
    sim.state.combo = 4; sim.state.comboTicks = 100; p.fireCooldown = 0;
    const before = sim.state.score;
    run(sim, 5, input({ aimX: 127, aimY: 0, buttons: Buttons.PRIMARY }));
    expect(sim.state.combo).toBe(5); expect(sim.state.score - before).toBe(200);
  });

  it("advances five assaults, brings in the boss, changes all three phases, and ends on a real boss kill", () => {
    const sim = createSimulation(6), p = sim.state.player;
    p.invulnerable = MAX_TICKS;
    run(sim, 720); expect(sim.state.wave).toBe(2);
    run(sim, 720); expect(sim.state.wave).toBe(3);
    run(sim, BOSS_TICK - sim.state.tick);
    expect(sim.state.wave).toBe(6); expect(sim.state.bossSpawned).toBe(true);
    const boss = sim.state.enemies.find(e => e.kind === "boss")!;
    expect(boss).toBeDefined(); expect(boss.spawnTicks).toBeGreaterThan(0);
    run(sim, 120); boss.hp = 559;
    expect(sim.step(input()).some(event => event.type === "boss" && event.value === 2)).toBe(true);
    boss.cooldown = 1; boss.attackIndex = 0; sim.step(input());
    expect(sim.state.bullets.filter(b => b.hostile)).toHaveLength(7);
    boss.hp = 279;
    expect(sim.step(input()).some(event => event.type === "boss" && event.value === 3)).toBe(true);
    expect(sim.state.bullets.filter(b => b.hostile)).toHaveLength(0);
    boss.cooldown = 1; boss.attackIndex = 0; sim.step(input());
    expect(sim.state.bullets.filter(b => b.hostile)).toHaveLength(9);
    expect(boss.cooldown).toBe(96);
    boss.hp = 6; p.x = boss.x; p.y = boss.y + 3; p.fireCooldown = 0;
    run(sim, 15, input({ buttons: Buttons.PRIMARY }));
    expect(sim.state.status).toBe("victory"); expect(sim.state.bossDefeated).toBe(true);
    const snapshot = JSON.stringify(sim.state); run(sim, 100, input({ x: 127, buttons: 3 }));
    expect(JSON.stringify(sim.state)).toBe(snapshot);
  });

  it("freezes loss, resets completely with the same seed, and enforces exactly 7200 ranked ticks", () => {
    const sim = createSimulation(7), p = sim.state.player;
    p.hp = 1; p.invulnerable = 0; sim.state.enemies = [enemy(900, "drone", p.x, p.y)];
    const events = sim.step(input());
    expect(sim.state.status).toBe("gameover"); expect(events.some(event => event.type === "death")).toBe(true);
    const snapshot = JSON.stringify(sim.state); run(sim, 30);
    expect(JSON.stringify(sim.state)).toBe(snapshot);
    const fresh = createSimulation(7); expect(fresh.state.tick).toBe(0); expect(fresh.state.player.hp).toBe(6); expect(fresh.state.score).toBe(0);
    fresh.state.player.invulnerable = MAX_TICKS + 1;
    run(fresh, MAX_TICKS + 20);
    expect(fresh.state.tick).toBe(MAX_TICKS); expect(fresh.state.status).toBe("gameover");
  });

  it("replays a complete 7200-tick input stream exactly and bounds every entity pool", () => {
    const a = createSimulation(982103), b = createSimulation(982103);
    // Isolate time cap and pool bounds from survival; combat and terminal rules have separate tests.
    a.state.player.invulnerable = b.state.player.invulnerable = MAX_TICKS + 1;
    for (let tick = 0; tick < MAX_TICKS; tick++) {
      const controls = input({ x: Math.round(Math.sin(tick * .013) * 127), y: Math.round(Math.cos(tick * .011) * 127),
        aimX: Math.round(Math.sin(tick * .023) * 127), aimY: Math.round(Math.cos(tick * .023) * 127),
        buttons: (tick < BOSS_TICK - 150 ? Buttons.PRIMARY : 0) | (tick % 180 === 0 ? Buttons.SECONDARY : 0) });
      expect(a.step(controls)).toEqual(b.step(controls));
      if (tick % 120 === 0) {
        expect(a.state).toEqual(b.state);
        expect(a.state.enemies.length).toBeLessThanOrEqual(LIMITS.enemies);
        expect(a.state.bullets.filter(shot => shot.hostile).length).toBeLessThanOrEqual(LIMITS.enemyShots);
        expect(a.state.bullets.filter(shot => !shot.hostile).length).toBeLessThanOrEqual(LIMITS.playerShots);
        expect(a.state.pickups.length).toBeLessThanOrEqual(LIMITS.pickups);
        expect(a.state.effects.length).toBeLessThanOrEqual(LIMITS.effects);
      }
    }
    expect(a.state).toEqual(b.state); expect(a.state.tick).toBe(MAX_TICKS);
  });

  it("can defeat the boss within two minutes using only ordinary movement, aiming, firing and dash inputs", () => {
    const sim = createSimulation(1984);
    for (let i = 0; i < MAX_TICKS && sim.state.status === "playing"; i++) sim.step(pilot(sim.state));
    expect(sim.state.status).toBe("victory");
    expect(sim.state.player.level).toBeGreaterThanOrEqual(3);
    expect(sim.state.tick).toBeLessThan(MAX_TICKS);
  });

  it("fits the full 3D arena on portrait and landscape screens and raycasts pointer aim relative to the craft", () => {
    const sim = createSimulation(8), scene = new THREE.Scene(), camera = new THREE.OrthographicCamera();
    const stage = { scene, camera, width: 960, height: 600, renderer: {} as THREE.WebGLRenderer } satisfies ThreeStage;
    const view = createView(stage, sim);
    for (const [width, height] of [[960, 600], [320, 700]]) {
      view.resize(width, height);
      view.update(0, { highContrast: true, reducedMotion: true });
      for (const x of [-13, 13]) for (const z of [-10, 10]) {
        const corner = new THREE.Vector3(x, 0, z).project(camera);
        expect(Math.abs(corner.x)).toBeLessThan(1); expect(Math.abs(corner.y)).toBeLessThan(1);
      }
      const pointer = new THREE.Vector3(sim.state.player.x + 5, 0, sim.state.player.y).project(camera);
      expect(view.aimAt!(pointer.x, -pointer.y)).toEqual({ aimX: 127, aimY: 0 });
    }
    view.dispose(); expect(scene.children).toHaveLength(0);
  });
});

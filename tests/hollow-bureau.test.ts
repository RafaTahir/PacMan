import { describe, expect, it } from "vitest";
import { Buttons, MAX_TICKS, NEUTRAL_INPUT, type ArcadeInput } from "../src/arcade/shared/contracts";
import { BEAT_TICKS, BOON_PADS, LIMITS, adrenalineLevel, createSimulation, onBeat, waveComposition, type Enemy } from "../src/arcade/games/hollow-bureau/model";

const idle: ArcadeInput = { ...NEUTRAL_INPUT };
const enemy = (patch: Partial<Enemy> = {}): Enemy => ({ id: 900, kind: "drifter", x: 0, y: 0, hp: 3, maxHp: 3, radius: .4, age: 0, spawnTicks: 0, cooldown: 99, chargeTicks: 0, aimX: 0, aimY: 1, flash: 0, ...patch });

describe("Hollow Bureau", () => {
  it("replays deterministically and stays bounded and finite", () => {
    const a = createSimulation(77), b = createSimulation(77);
    for (let t = 0; t < MAX_TICKS; t++) {
      const i: ArcadeInput = { x: Math.round(Math.sin(t / 50) * 127), y: Math.round(Math.cos(t / 70) * 127), aimX: Math.round(Math.cos(t / 15) * 127), aimY: Math.round(Math.sin(t / 15) * 127), buttons: Buttons.PRIMARY | (t % 120 < 6 ? Buttons.SECONDARY : 0) };
      expect(a.step(i)).toEqual(b.step(i));
      if (t % 240 === 0) {
        expect(a.state).toEqual(b.state);
        expect(a.state.enemies.length).toBeLessThanOrEqual(LIMITS.enemies);
        expect(a.state.bullets.length).toBeLessThanOrEqual(LIMITS.playerShots + LIMITS.enemyShots);
        expect(a.state.effects.length).toBeLessThanOrEqual(LIMITS.effects);
      }
    }
    expect(Number.isFinite(a.state.score)).toBe(true);
  });

  it("opens a beat window every half second", () => {
    expect(onBeat(0)).toBe(true);
    expect(onBeat(BEAT_TICKS)).toBe(true);
    expect(onBeat(BEAT_TICKS / 2)).toBe(false);
    expect(onBeat(BEAT_TICKS - 2)).toBe(true);
  });

  it("deals double damage on the beat and flags the shot", () => {
    const g = createSimulation(1);
    g.state.tick = BEAT_TICKS - 1;
    g.step({ ...idle, buttons: Buttons.PRIMARY });
    const shot = g.state.bullets.find(b => !b.hostile)!;
    expect(shot.onBeat).toBe(true);
    expect(shot.damage).toBe(2);
    const off = createSimulation(1);
    off.state.tick = BEAT_TICKS / 2 - 1;
    off.step({ ...idle, buttons: Buttons.PRIMARY });
    expect(off.state.bullets.find(b => !b.hostile)!.damage).toBe(1);
  });

  it("builds adrenaline from kills and resets it when the player is hit", () => {
    const g = createSimulation(2);
    g.state.player.invulnerable = 0;
    g.state.spawnCountdown = 9999;
    for (let n = 0; n < 4; n++) {
      g.state.enemies.push(enemy({ id: 900 + n, x: g.state.player.x, y: g.state.player.y - 3 + n * .01, hp: 1 }));
      g.state.bullets.push({ id: 5000 + n, x: g.state.player.x, y: g.state.player.y - 3, vx: 0, vy: 0, radius: .2, damage: 1, ttl: 20, hostile: false, pierce: 0, onBeat: false });
      g.step(idle);
    }
    expect(g.state.adrenaline).toBe(4);
    expect(adrenalineLevel(g.state)).toBe(1);
    g.state.bullets.push({ id: 6000, x: g.state.player.x, y: g.state.player.y, vx: 0, vy: 0, radius: .3, damage: 1, ttl: 20, hostile: true, pierce: 0, onBeat: false });
    g.step(idle);
    expect(g.state.adrenaline).toBe(0);
    expect(g.state.player.hp).toBe(4);
  });

  it("dash grants i-frames against hostile fire", () => {
    const g = createSimulation(3);
    g.state.player.invulnerable = 0;
    g.state.spawnCountdown = 9999;
    g.step({ ...idle, x: 127, buttons: Buttons.SECONDARY });
    expect(g.state.player.dashTicks).toBeGreaterThan(0);
    g.state.bullets.push({ id: 7000, x: g.state.player.x, y: g.state.player.y, vx: 0, vy: 0, radius: .3, damage: 1, ttl: 20, hostile: true, pierce: 0, onBeat: false });
    g.step({ ...idle, x: 127, buttons: Buttons.SECONDARY });
    expect(g.state.player.hp).toBe(5);
  });

  it("scales waves and offers three distinct boons that are applied by walking onto a pad", () => {
    expect(waveComposition(5).hulks).toBeGreaterThan(waveComposition(1).hulks);
    const g = createSimulation(4);
    g.state.spawnCountdown = 1;
    g.step(idle);
    g.state.enemies = [];
    g.step(idle);
    expect(g.state.offer).not.toBeNull();
    expect(new Set(g.state.offer).size).toBe(3);
    const pick = g.state.offer![0], wave = g.state.wave;
    g.state.player.x = BOON_PADS[0].x; g.state.player.y = BOON_PADS[0].y;
    g.step(idle);
    expect(g.state.offer).toBeNull();
    expect(g.state.boons).toEqual([pick]);
    expect(g.state.wave).toBe(wave + 1);
  });

  it("applies the crossfire boon as three shots", () => {
    const g = createSimulation(5);
    g.state.boons.push("crossfire");
    g.step({ ...idle, buttons: Buttons.PRIMARY });
    expect(g.state.bullets.filter(b => !b.hostile)).toHaveLength(3);
  });

  it("freezes after the run ends", () => {
    const g = createSimulation(6);
    g.state.player.hp = 1; g.state.player.invulnerable = 0;
    g.state.bullets.push({ id: 8000, x: g.state.player.x, y: g.state.player.y, vx: 0, vy: 0, radius: .3, damage: 1, ttl: 20, hostile: true, pierce: 0, onBeat: false });
    g.step(idle);
    expect(g.state.status).toBe("gameover");
    const tick = g.state.tick;
    expect(g.step(idle)).toEqual([]);
    expect(g.state.tick).toBe(tick);
  });

  it("is winnable: a skilled strafing bot clears all five waves on some seed", () => {
    let wins = 0;
    for (const seed of [1, 7, 53, 1024, 41801, 9, 12, 300]) {
      const g = createSimulation(seed);
      for (let t = 0; t < MAX_TICKS && g.state.status === "playing"; t++) {
        const s = g.state, p = s.player;
        if (s.offer) { const pad = BOON_PADS[0]; g.step({ x: Math.sign(pad.x - p.x) * 127, y: Math.sign(pad.y - p.y) * 127, aimX: 0, aimY: -127, buttons: 0 }); continue; }
        const live = s.enemies.filter(e => e.spawnTicks === 0);
        const target = live.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        const dx = target ? target.x - p.x : 0, dy = target ? target.y - p.y : -1, d = Math.hypot(dx, dy) || 1;
        const kite = d < 5 ? -1 : d > 8 ? 1 : 0, strafe = Math.sin(t / 18);
        g.step({ x: Math.round((dx / d * kite - dy / d * strafe) * 90), y: Math.round((dy / d * kite + dx / d * strafe) * 90), aimX: Math.round(dx / d * 127), aimY: Math.round(dy / d * 127), buttons: Buttons.PRIMARY | (d < 3 && p.dashCooldown === 0 ? Buttons.SECONDARY : 0) });
      }
      if (g.state.status === "victory") wins++;
    }
    expect(wins).toBeGreaterThan(0);
  });
});

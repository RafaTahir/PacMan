import { Buttons, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from "../../shared/contracts";
import { clamp, normalize, seededRandom } from "../../shared/math";

export const ARENA = { halfWidth: 11.4, halfHeight: 8.4 } as const;
export const LIMITS = { enemies: 20, playerShots: 48, enemyShots: 64, effects: 32 } as const;
export const BEAT_TICKS = 30;
export const BEAT_WINDOW = 4;
export const FINAL_WAVE = 5;
export const BASE_DASH_COOLDOWN = 96;
export const DASH_DURATION = 12;
export const BOON_PADS = [{ x: -6, y: -3 }, { x: 0, y: -3 }, { x: 6, y: -3 }] as const;
export type EnemyKind = "drifter" | "caster" | "hulk";
export type BoonKind = "overclock" | "piercing" | "afterimage" | "bulwark" | "crossfire";
export const BOONS: readonly BoonKind[] = ["overclock", "piercing", "afterimage", "bulwark", "crossfire"];
export interface Player {
  x: number; y: number; aimX: number; aimY: number; hp: number; maxHp: number;
  invulnerable: number; dashTicks: number; dashCooldown: number; dashX: number; dashY: number; fireCooldown: number;
}
export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; radius: number;
  age: number; spawnTicks: number; cooldown: number; chargeTicks: number; aimX: number; aimY: number; flash: number;
}
export interface Bullet { id: number; x: number; y: number; vx: number; vy: number; radius: number; damage: number; ttl: number; hostile: boolean; pierce: number; onBeat: boolean }
export interface Effect { id: number; x: number; y: number; kind: "kill" | "hurt" | "dash" | "boon" | "beat"; ttl: number; maxTtl: number }
export interface BureauState extends ArcadeState {
  player: Player; enemies: Enemy[]; bullets: Bullet[]; effects: Effect[];
  wave: number; combo: number; bestCombo: number; adrenaline: number; boons: BoonKind[]; offer: BoonKind[] | null;
  spawnCountdown: number; waveBanner: number; beatKills: number; beatShots: number; kills: number; allClear: boolean;
}

const PLAYER_RADIUS = .36;
const near = (ax: number, ay: number, bx: number, by: number, r: number) => (ax - bx) ** 2 + (ay - by) ** 2 <= r * r;
function segmentHits(x: number, y: number, nx: number, ny: number, tx: number, ty: number, radius: number) {
  const dx = nx - x, dy = ny - y;
  const t = clamp(((tx - x) * dx + (ty - y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return near(x + dx * t, y + dy * t, tx, ty, radius);
}
export const adrenalineLevel = (state: Pick<BureauState, "adrenaline">) => Math.min(5, Math.floor(state.adrenaline / 4));
export const onBeat = (tick: number) => { const phase = tick % BEAT_TICKS; return phase <= BEAT_WINDOW || phase >= BEAT_TICKS - BEAT_WINDOW; };
export const waveComposition = (wave: number) => ({ drifters: Math.min(12, 3 + wave * 2), casters: Math.max(0, wave - 1), hulks: Math.max(0, wave - 2) });

/** Fixed-step arena shooter. Beats are derived from the tick, so replays stay exact. */
export function createSimulation(seed: number): ArcadeSimulation<BureauState> {
  const random = seededRandom(seed);
  let nextId = 1, dashHeld = false, events: GameSignal[] = [];
  const state: BureauState = {
    seed: seed >>> 0, tick: 0, score: 0, status: "playing", wave: 1, combo: 0, bestCombo: 0, adrenaline: 0, boons: [], offer: null,
    spawnCountdown: 90, waveBanner: 150, beatKills: 0, beatShots: 0, kills: 0, allClear: false,
    player: { x: 0, y: 3, aimX: 0, aimY: -1, hp: 5, maxHp: 5, invulnerable: 60, dashTicks: 0, dashCooldown: 0, dashX: 0, dashY: -1, fireCooldown: 0 },
    enemies: [], bullets: [], effects: [],
  };
  const p = state.player;
  const has = (boon: BoonKind) => state.boons.includes(boon);
  const signal = (type: GameSignal["type"], value?: number) => { events.push(value === undefined ? { type } : { type, value }); };
  const award = (value: number) => { state.score += value; signal("score", value); };
  function effect(x: number, y: number, kind: Effect["kind"], ttl = 24) {
    if (state.effects.length >= LIMITS.effects) state.effects.shift();
    state.effects.push({ id: nextId++, x, y, kind, ttl, maxTtl: ttl });
  }
  function shoot(x: number, y: number, angle: number, speed: number, hostile: boolean, damage = 1, radius = .13, beat = false) {
    if (state.bullets.reduce((n, b) => n + Number(b.hostile === hostile), 0) >= (hostile ? LIMITS.enemyShots : LIMITS.playerShots)) return;
    state.bullets.push({ id: nextId++, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius, damage, hostile,
      ttl: hostile ? 280 : 48, pierce: hostile || !has("piercing") ? 0 : 2, onBeat: beat });
  }
  function spawn(kind: EnemyKind, delay: number) {
    if (state.enemies.length >= LIMITS.enemies) return;
    let x = 0, y = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const side = Math.floor(random() * 4), along = random() * 2 - 1;
      x = side < 2 ? (side === 0 ? -10.8 : 10.8) : along * 10.2;
      y = side >= 2 ? (side === 2 ? -7.8 : 7.8) : along * 7.2;
      if (!near(x, y, p.x, p.y, 6)) break;
    }
    const hp = kind === "hulk" ? 14 : kind === "caster" ? 6 : 3;
    state.enemies.push({ id: nextId++, kind, x, y, hp, maxHp: hp, radius: kind === "hulk" ? .7 : kind === "caster" ? .5 : .4,
      age: 0, spawnTicks: 36 + delay, cooldown: 80 + Math.floor(random() * 60), chargeTicks: 0, aimX: 0, aimY: 1, flash: 0 });
  }
  function spawnWave() {
    const c = waveComposition(state.wave);
    let delay = 0;
    for (let i = 0; i < c.drifters; i++) spawn("drifter", delay += 5);
    for (let i = 0; i < c.casters; i++) spawn("caster", delay += 9);
    for (let i = 0; i < c.hulks; i++) spawn("hulk", delay += 14);
    state.waveBanner = 120;
  }
  function damagePlayer() {
    if (p.invulnerable > 0 || p.dashTicks > 0 || state.status !== "playing") return;
    p.hp--; p.invulnerable = 84; state.combo = 0; state.adrenaline = 0;
    effect(p.x, p.y, "hurt", 36); signal("hit");
    if (p.hp <= 0) { state.status = "gameover"; signal("death"); signal("lose"); }
  }
  function kill(enemy: Enemy, beat: boolean) {
    state.kills++; state.combo++; state.adrenaline++; state.bestCombo = Math.max(state.bestCombo, state.combo);
    if (beat) state.beatKills++;
    const base = enemy.kind === "hulk" ? 400 : enemy.kind === "caster" ? 200 : 100;
    award(Math.floor(base * (1 + adrenalineLevel(state)) * (beat ? 1.5 : 1)));
    if (state.adrenaline % 4 === 0 && adrenalineLevel(state) <= 5) signal("chain", adrenalineLevel(state));
    effect(enemy.x, enemy.y, "kill", 24);
  }
  function offerBoons() {
    const pool = BOONS.filter(b => b === "bulwark" || !has(b));
    const picks: BoonKind[] = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    state.offer = picks;
  }
  function takeBoon(kind: BoonKind) {
    state.boons.push(kind); state.offer = null; state.wave++; state.spawnCountdown = 70;
    if (kind === "bulwark") { p.maxHp = Math.min(8, p.maxHp + 1); p.hp = Math.min(p.maxHp, p.hp + 2); }
    effect(p.x, p.y, "boon", 48); signal("upgrade", state.boons.length);
  }
  function updatePlayer(input: Readonly<ArcadeInput>) {
    const move = normalize(input.x, input.y), magnitude = Math.min(1, Math.hypot(input.x, input.y) / 127);
    const aim = normalize(input.aimX, input.aimY); p.aimX = aim.x; p.aimY = aim.y;
    const dashPress = Boolean(input.buttons & Buttons.SECONDARY) && !dashHeld; dashHeld = Boolean(input.buttons & Buttons.SECONDARY);
    if (dashPress && p.dashCooldown === 0 && p.dashTicks === 0) {
      const direction = magnitude > .1 ? move : aim;
      p.dashX = direction.x; p.dashY = direction.y; p.dashTicks = DASH_DURATION;
      p.dashCooldown = has("afterimage") ? Math.round(BASE_DASH_COOLDOWN * .6) : BASE_DASH_COOLDOWN;
      effect(p.x, p.y, "dash", 18); signal("dash");
    }
    p.dashCooldown = Math.max(0, p.dashCooldown - 1); p.invulnerable = Math.max(0, p.invulnerable - 1);
    if (p.dashTicks > 0) { p.dashTicks--; p.x += p.dashX * .3; p.y += p.dashY * .3; }
    else if (magnitude > .05) { p.x += move.x * magnitude * .115; p.y += move.y * magnitude * .115; }
    p.x = clamp(p.x, -ARENA.halfWidth, ARENA.halfWidth); p.y = clamp(p.y, -ARENA.halfHeight, ARENA.halfHeight);
    p.fireCooldown = Math.max(0, p.fireCooldown - 1);
    if ((input.buttons & Buttons.PRIMARY) && p.fireCooldown === 0 && !state.offer) {
      const beat = onBeat(state.tick), angle = Math.atan2(p.aimY, p.aimX), damage = beat ? 2 : 1;
      shoot(p.x, p.y, angle, .45, false, damage, .14, beat);
      if (has("crossfire")) { shoot(p.x, p.y, angle - .2, .45, false, damage, .14, beat); shoot(p.x, p.y, angle + .2, .45, false, damage, .14, beat); }
      if (beat) { state.beatShots++; effect(p.x, p.y, "beat", 12); }
      p.fireCooldown = Math.max(5, (has("overclock") ? 8 : 11) - Math.floor(adrenalineLevel(state) / 2));
      signal("shot");
    }
  }
  function updateEnemies() {
    for (const enemy of state.enemies) {
      enemy.age++; enemy.flash = Math.max(0, enemy.flash - 1);
      if (enemy.spawnTicks > 0) { enemy.spawnTicks--; continue; }
      const n = normalize(p.x - enemy.x, p.y - enemy.y), distance = Math.hypot(p.x - enemy.x, p.y - enemy.y);
      const oldX = enemy.x, oldY = enemy.y;
      enemy.cooldown--;
      if (enemy.kind === "drifter") {
        const sway = Math.sin(enemy.age * .05 + enemy.id) * .35, speed = .04 + state.wave * .003;
        enemy.x += (n.x - n.y * sway) * speed; enemy.y += (n.y + n.x * sway) * speed;
      } else if (enemy.kind === "caster") {
        const toward = distance > 7 ? 1 : distance < 4.5 ? -.9 : 0;
        if (enemy.cooldown > 28) { enemy.x += (n.x * toward - n.y * .4) * .03; enemy.y += (n.y * toward + n.x * .4) * .03; }
        if (enemy.cooldown === 28) { enemy.aimX = n.x; enemy.aimY = n.y; }
        if (enemy.cooldown <= 0) { shoot(enemy.x, enemy.y, Math.atan2(enemy.aimY, enemy.aimX), .1, true, 1, .16); enemy.cooldown = Math.max(70, 120 - state.wave * 6); }
      } else if (enemy.chargeTicks > 0) {
        enemy.chargeTicks--; enemy.x += enemy.aimX * .17; enemy.y += enemy.aimY * .17;
        if (enemy.chargeTicks === 0) enemy.cooldown = 140;
      } else if (enemy.cooldown > 34) { enemy.x += n.x * .024; enemy.y += n.y * .024; }
      else {
        if (enemy.cooldown === 34) { enemy.aimX = n.x; enemy.aimY = n.y; }
        if (enemy.cooldown <= 0) enemy.chargeTicks = 24;
      }
      enemy.x = clamp(enemy.x, -ARENA.halfWidth - .4, ARENA.halfWidth + .4); enemy.y = clamp(enemy.y, -ARENA.halfHeight - .4, ARENA.halfHeight + .4);
      if (segmentHits(oldX, oldY, enemy.x, enemy.y, p.x, p.y, enemy.radius + PLAYER_RADIUS)) damagePlayer();
    }
  }
  function updateBullets() {
    const remaining: Bullet[] = [];
    for (const b of state.bullets) {
      const ox = b.x, oy = b.y; b.x += b.vx; b.y += b.vy; b.ttl--;
      if (b.ttl <= 0 || Math.abs(b.x) > ARENA.halfWidth + 1.5 || Math.abs(b.y) > ARENA.halfHeight + 1.5) continue;
      if (b.hostile) {
        const hit = segmentHits(ox, oy, b.x, b.y, p.x, p.y, b.radius + PLAYER_RADIUS);
        if (hit && p.dashTicks === 0 && p.invulnerable === 0) { damagePlayer(); continue; }
        remaining.push(b); continue;
      }
      let spent = false;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || enemy.spawnTicks > 0 || !segmentHits(ox, oy, b.x, b.y, enemy.x, enemy.y, enemy.radius + b.radius)) continue;
        enemy.hp -= b.damage; enemy.flash = 4; signal("hit", b.damage);
        if (enemy.hp <= 0) kill(enemy, b.onBeat);
        if (b.pierce > 0) b.pierce--; else { spent = true; break; }
      }
      if (!spent) remaining.push(b);
    }
    state.bullets = remaining; state.enemies = state.enemies.filter(e => e.hp > 0);
  }
  return {
    state,
    step(input) {
      if (state.status !== "playing") return [];
      events = []; state.tick++;
      state.waveBanner = Math.max(0, state.waveBanner - 1);
      state.effects = state.effects.filter(e => --e.ttl > 0);
      if (state.tick % BEAT_TICKS === 0) signal("bounce");
      updatePlayer(input);
      if (state.offer) {
        const pad = BOON_PADS.findIndex((spot, i) => i < state.offer!.length && near(p.x, p.y, spot.x, spot.y, 1.15));
        if (pad >= 0) takeBoon(state.offer[pad]);
      } else {
        if (state.spawnCountdown > 0 && --state.spawnCountdown === 0) spawnWave();
        updateEnemies(); if (state.status === "playing") updateBullets();
        if (state.status === "playing" && state.spawnCountdown === 0 && state.enemies.length === 0) {
          state.bullets = state.bullets.filter(b => !b.hostile);
          if (state.wave >= FINAL_WAVE) {
            state.allClear = true; state.status = "victory";
            award((MAX_TICKS - state.tick) * 2 + p.hp * 400 + state.beatKills * 25); signal("win");
          } else { award(state.wave * 200); offerBoons(); signal("boss", state.wave); }
        }
      }
      if (state.status === "playing" && state.tick >= MAX_TICKS) {
        state.status = state.wave >= 3 ? "victory" : "gameover"; signal(state.status === "victory" ? "win" : "lose");
      }
      return events;
    },
  };
}

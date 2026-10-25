import { Buttons, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from "../../shared/contracts";
import { axis, clamp, normalize, seededRandom } from "../../shared/math";

export const ARENA = { halfWidth: 12, halfHeight: 9 } as const;
export const LIMITS = { enemies: 32, playerShots: 64, enemyShots: 112, pickups: 64, effects: 48 } as const;
export const BOSS_TICK = 3600;
export const DASH_DURATION = 16;
export const DASH_COOLDOWN = 144;
export type EnemyKind = "drone" | "gunner" | "brute" | "boss";
export interface Player {
  x: number; y: number; aimX: number; aimY: number; hp: number; maxHp: number;
  invulnerable: number; dashTicks: number; dashCooldown: number; dashX: number; dashY: number;
  fireCooldown: number; level: number; xp: number; nextXp: number; kills: number;
}
export interface Enemy {
  id: number; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; radius: number;
  age: number; spawnTicks: number; cooldown: number; chargeTicks: number; aimX: number; aimY: number;
  phase: number; attackIndex: number; flash: number;
}
export interface Bullet {
  id: number; x: number; y: number; vx: number; vy: number; radius: number;
  damage: number; ttl: number; hostile: boolean;
}
export interface Pickup { id: number; x: number; y: number; kind: "core" | "repair"; value: number; ttl: number }
export interface Effect { id: number; x: number; y: number; kind: "kill" | "hurt" | "dash" | "upgrade"; ttl: number; maxTtl: number }
export interface SiegeState extends ArcadeState {
  player: Player; enemies: Enemy[]; bullets: Bullet[]; pickups: Pickup[]; effects: Effect[];
  wave: number; combo: number; comboTicks: number; bestCombo: number; bossSpawned: boolean;
  bossDefeated: boolean; waveBanner: number; spawnCountdown: number;
}

const PLAYER_RADIUS = .37;
const TAU = Math.PI * 2;
const near = (ax: number, ay: number, bx: number, by: number, r: number) => (ax - bx) ** 2 + (ay - by) ** 2 <= r * r;

/** Segment collision prevents a fast player round or charge from tunnelling through its target. */
function segmentHits(x: number, y: number, nx: number, ny: number, tx: number, ty: number, radius: number) {
  const dx = nx - x, dy = ny - y;
  const t = clamp(((tx - x) * dx + (ty - y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return near(x + dx * t, y + dy * t, tx, ty, radius);
}

export function createSimulation(seed: number): ArcadeSimulation<SiegeState> {
  const random = seededRandom(seed);
  let nextId = 1;
  let secondaryDown = false;
  let events: GameSignal[] = [];
  const state: SiegeState = {
    seed: seed >>> 0, tick: 0, score: 0, status: "playing", wave: 1, combo: 0, comboTicks: 0,
    bestCombo: 0, bossSpawned: false, bossDefeated: false, waveBanner: 180, spawnCountdown: 75,
    player: { x: 0, y: 3, aimX: 0, aimY: -1, hp: 6, maxHp: 6, invulnerable: 60,
      dashTicks: 0, dashCooldown: 0, dashX: 0, dashY: -1, fireCooldown: 0,
      level: 1, xp: 0, nextXp: 8, kills: 0 },
    enemies: [], bullets: [], pickups: [], effects: [],
  };
  const p = state.player;
  function signal(type: GameSignal["type"], value?: number) { events.push({ type, ...(value === undefined ? {} : { value }) }); }
  function score(value: number) { state.score += value; signal("score", value); }
  function effect(x: number, y: number, kind: Effect["kind"], ttl = 24) {
    if (state.effects.length >= LIMITS.effects) state.effects.shift();
    state.effects.push({ id: nextId++, x, y, kind, ttl, maxTtl: ttl });
  }
  function pickup(x: number, y: number, kind: Pickup["kind"], value: number) {
    // Consolidate cores at the cap without converting experience into repair value.
    if (state.pickups.length >= LIMITS.pickups) {
      const cores = state.pickups.filter(item => item.kind === "core");
      if (cores.length >= 2) {
        cores[1].value += cores[0].value;
        state.pickups.splice(state.pickups.indexOf(cores[0]), 1);
      } else {
        const repair = state.pickups.findIndex(item => item.kind === "repair");
        state.pickups.splice(repair >= 0 ? repair : 0, 1);
      }
    }
    state.pickups.push({ id: nextId++, x, y, kind, value, ttl: 1200 });
  }
  function shoot(x: number, y: number, angle: number, speed: number, hostile: boolean, damage = 1, radius = .13) {
    const count = state.bullets.reduce((n, b) => n + Number(b.hostile === hostile), 0);
    if (count >= (hostile ? LIMITS.enemyShots : LIMITS.playerShots)) return;
    state.bullets.push({ id: nextId++, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius, damage, hostile, ttl: hostile ? 300 : 100 });
  }
  function spawn(kind: EnemyKind, x?: number, y?: number) {
    if (state.enemies.length >= LIMITS.enemies) return;
    if (x === undefined || y === undefined) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const side = Math.floor(random() * 4), along = random() * 2 - 1;
        x = side < 2 ? (side === 0 ? -11 : 11) : along * 10.6;
        y = side >= 2 ? (side === 2 ? -8 : 8) : along * 7.6;
        if (!near(x, y, p.x, p.y, 6)) break;
      }
    }
    const hp = kind === "boss" ? 840 : kind === "brute" ? 54 : kind === "gunner" ? 24 : 12;
    state.enemies.push({ id: nextId++, kind, x: x!, y: y!, hp, maxHp: hp,
      radius: kind === "boss" ? 1.35 : kind === "brute" ? .65 : kind === "gunner" ? .48 : .4,
      age: 0, spawnTicks: kind === "boss" ? 120 : 42, cooldown: kind === "boss" ? 180 : 90 + Math.floor(random() * 60),
      chargeTicks: 0, aimX: 0, aimY: 1, phase: 1, attackIndex: 0, flash: 0 });
  }
  function damagePlayer(damage: number) {
    if (p.invulnerable > 0 || p.dashTicks > 0 || state.status !== "playing") return;
    p.hp = Math.max(0, p.hp - damage); p.invulnerable = 84;
    state.combo = 0; state.comboTicks = 0;
    effect(p.x, p.y, "hurt", 36); signal("hit", damage);
    if (p.hp === 0) { state.status = "gameover"; signal("death"); signal("lose"); }
  }
  function upgrade() {
    while (p.xp >= p.nextXp && p.level < 8) {
      p.xp -= p.nextXp; p.level++; p.nextXp = 8 + p.level * 5;
      if (p.level % 2 === 0) p.maxHp = Math.min(9, p.maxHp + 1);
      p.hp = Math.min(p.maxHp, p.hp + 1);
      effect(p.x, p.y, "upgrade", 60); signal("upgrade", p.level); score(250 * p.level);
    }
    if (p.level === 8) p.xp = Math.min(p.xp, p.nextXp);
  }
  function kill(enemy: Enemy) {
    state.combo++; state.bestCombo = Math.max(state.bestCombo, state.combo); state.comboTicks = 210;
    p.kills++;
    const multiplier = Math.min(5, 1 + Math.floor(state.combo / 5));
    score((enemy.kind === "boss" ? 10000 : enemy.kind === "brute" ? 280 : enemy.kind === "gunner" ? 160 : 100) * multiplier);
    if (state.combo % 5 === 0) signal("chain", multiplier);
    effect(enemy.x, enemy.y, "kill", enemy.kind === "boss" ? 90 : 24);
    if (enemy.kind === "boss") {
      state.bossDefeated = true; state.status = "victory";
      score(Math.max(0, MAX_TICKS - state.tick) * 2 + p.hp * 500);
      state.bullets = []; state.enemies = []; signal("win");
    } else {
      pickup(enemy.x, enemy.y, "core", enemy.kind === "brute" ? 7 : enemy.kind === "gunner" ? 4 : 3);
      if (p.kills % 8 === 0) pickup(enemy.x + .35, enemy.y, "repair", 2);
    }
  }
  function aim(enemy: Enemy) {
    const n = normalize(p.x - enemy.x, p.y - enemy.y); enemy.aimX = n.x; enemy.aimY = n.y;
  }
  function bossAttack(enemy: Enemy) {
    const base = Math.atan2(enemy.aimY, enemy.aimX);
    const pattern = enemy.attackIndex % 3;
    if (pattern === 0) {
      const count = 3 + enemy.phase * 2;
      for (let i = 0; i < count; i++) shoot(enemy.x, enemy.y, base + (i - (count - 1) / 2) * .19, .092 + enemy.phase * .006, true, 1, .17);
    } else if (pattern === 1) {
      const count = 10 + enemy.phase * 3;
      // One generous sector stays open. Its direction rotates each salvo.
      const gap = base + Math.PI / 2;
      for (let i = 0; i < count; i++) {
        const angle = gap + .48 + i * (TAU - .96) / (count - 1);
        shoot(enemy.x, enemy.y, angle, .065 + enemy.phase * .008, true, 1, .18);
      }
    } else {
      for (let i = -1; i <= 1; i++) {
        shoot(enemy.x + i * .75, enemy.y, base, .12 + enemy.phase * .008, true, 1, .2);
        if (enemy.phase >= 2) shoot(enemy.x + i * .75, enemy.y, base + i * .32, .085, true, 1, .15);
      }
    }
    enemy.attackIndex++; enemy.cooldown = 156 - enemy.phase * 20;
  }
  function updateEnemies() {
    for (const enemy of state.enemies) {
      enemy.age++; enemy.flash = Math.max(0, enemy.flash - 1);
      if (enemy.spawnTicks > 0) { enemy.spawnTicks--; continue; }
      const n = normalize(p.x - enemy.x, p.y - enemy.y), distance = Math.hypot(p.x - enemy.x, p.y - enemy.y);
      const oldX = enemy.x, oldY = enemy.y;
      enemy.cooldown--;
      if (enemy.kind === "drone") {
        const sway = Math.sin(enemy.age * .045 + enemy.id) * .3;
        const speed = .028 + state.wave * .0018;
        enemy.x += (n.x - n.y * sway) * speed; enemy.y += (n.y + n.x * sway) * speed;
        enemy.aimX = n.x; enemy.aimY = n.y;
      } else if (enemy.kind === "gunner") {
        const toward = distance > 7 ? 1 : distance < 5 ? -.8 : 0;
        if (enemy.cooldown > 26) {
          const orbit = enemy.id % 2 ? .6 : -.6;
          enemy.x += (n.x * toward - n.y * orbit) * .032;
          enemy.y += (n.y * toward + n.x * orbit) * .032;
        }
        if (enemy.cooldown === 26) aim(enemy);
        if (enemy.cooldown <= 0) {
          shoot(enemy.x, enemy.y, Math.atan2(enemy.aimY, enemy.aimX), .098, true);
          enemy.cooldown = Math.max(78, 126 - state.wave * 7);
        }
      } else if (enemy.kind === "brute") {
        if (enemy.chargeTicks > 0) {
          enemy.chargeTicks--; enemy.x += enemy.aimX * .19; enemy.y += enemy.aimY * .19;
          if (enemy.chargeTicks === 0) enemy.cooldown = 150;
        } else if (enemy.cooldown > 36) {
          enemy.x += n.x * .022; enemy.y += n.y * .022;
        } else {
          if (enemy.cooldown === 36) aim(enemy);
          if (enemy.cooldown <= 0) enemy.chargeTicks = 25;
        }
      } else {
        const phase = enemy.hp <= enemy.maxHp / 3 ? 3 : enemy.hp <= enemy.maxHp * 2 / 3 ? 2 : 1;
        if (phase !== enemy.phase) {
          enemy.phase = phase; enemy.cooldown = 75; state.waveBanner = 100;
          // Phase transitions clear old bullets and provide a readable breathing space.
          state.bullets = state.bullets.filter(b => !b.hostile); signal("boss", phase);
        }
        if (enemy.cooldown > 36) {
          enemy.x += (Math.sin(enemy.age * .009) * 6 - enemy.x) * .012;
          enemy.y += (-4.8 + Math.sin(enemy.age * .015) * .9 - enemy.y) * .012;
        }
        if (enemy.cooldown === 36) aim(enemy);
        if (enemy.cooldown <= 0) bossAttack(enemy);
      }
      enemy.x = clamp(enemy.x, -11.3, 11.3); enemy.y = clamp(enemy.y, -8.3, 8.3);
      if (segmentHits(oldX, oldY, enemy.x, enemy.y, p.x, p.y, enemy.radius + PLAYER_RADIUS)) damagePlayer(enemy.kind === "brute" && enemy.chargeTicks > 0 ? 2 : 1);
    }
  }
  function updateBullets() {
    if (state.status !== "playing") return;
    // Compact in place. Each round can damage only its first intersected target.
    const survivors: Bullet[] = [];
    for (const bullet of state.bullets) {
      const nx = bullet.x + bullet.vx, ny = bullet.y + bullet.vy;
      bullet.ttl--;
      let consumed = bullet.ttl <= 0 || Math.abs(nx) > 12.7 || Math.abs(ny) > 9.7;
      if (!consumed && bullet.hostile) {
        if (segmentHits(bullet.x, bullet.y, nx, ny, p.x, p.y, PLAYER_RADIUS + bullet.radius)) {
          damagePlayer(bullet.damage); consumed = true;
        }
      } else if (!consumed) {
        for (const enemy of state.enemies) {
          if (enemy.spawnTicks > 0 || enemy.hp <= 0) continue;
          if (segmentHits(bullet.x, bullet.y, nx, ny, enemy.x, enemy.y, enemy.radius + bullet.radius)) {
            enemy.hp -= bullet.damage; enemy.flash = 5; consumed = true;
            if (enemy.hp <= 0) kill(enemy);
            break;
          }
        }
      }
      bullet.x = nx; bullet.y = ny;
      if (!consumed && state.status === "playing") survivors.push(bullet);
      if (state.status !== "playing") break;
    }
    state.bullets = state.status === "playing" ? survivors : [];
    state.enemies = state.enemies.filter(e => e.hp > 0 && !state.bossDefeated);
  }
  function updatePickups() {
    state.pickups = state.pickups.filter(item => {
      item.ttl--;
      const n = normalize(p.x - item.x, p.y - item.y);
      const distance = Math.hypot(p.x - item.x, p.y - item.y);
      if (distance < 2.3 + p.level * .25) { item.x += n.x * Math.min(.17, distance); item.y += n.y * Math.min(.17, distance); }
      if (near(item.x, item.y, p.x, p.y, .65)) {
        if (item.kind === "core") { p.xp += item.value; upgrade(); }
        else { p.hp = Math.min(p.maxHp, p.hp + item.value); score(120); signal("boost"); }
        return false;
      }
      return item.ttl > 0;
    });
  }
  function step(input: Readonly<ArcadeInput>): readonly GameSignal[] {
    events = [];
    if (state.status !== "playing") return events;
    state.tick++;
    p.invulnerable = Math.max(0, p.invulnerable - 1);
    p.dashCooldown = Math.max(0, p.dashCooldown - 1);
    p.fireCooldown = Math.max(0, p.fireCooldown - 1);
    state.waveBanner = Math.max(0, state.waveBanner - 1);
    state.comboTicks = Math.max(0, state.comboTicks - 1);
    if (state.comboTicks === 0) state.combo = 0;
    const mx = axis(input.x) / 127, my = axis(input.y) / 127;
    const magnitude = Math.hypot(mx, my), move = magnitude > 1 ? { x: mx / magnitude, y: my / magnitude } : { x: mx, y: my };
    const ax = axis(input.aimX), ay = axis(input.aimY);
    if (ax || ay) { const n = normalize(ax, ay); p.aimX = n.x; p.aimY = n.y; }
    const secondary = !!(input.buttons & Buttons.SECONDARY);
    if (secondary && !secondaryDown && p.dashCooldown === 0) {
      const direction = magnitude > .1 ? normalize(move.x, move.y) : { x: p.aimX, y: p.aimY };
      p.dashX = direction.x; p.dashY = direction.y; p.dashTicks = DASH_DURATION;
      p.dashCooldown = p.level >= 4 ? 120 : DASH_COOLDOWN;
      effect(p.x, p.y, "dash", 24); signal("dash");
    }
    secondaryDown = secondary;
    if (p.dashTicks > 0) {
      p.x += p.dashX * .31; p.y += p.dashY * .31; p.dashTicks--;
      // The final dash tick receives the same protection as its movement.
      p.invulnerable = Math.max(p.invulnerable, 2);
    } else { p.x += move.x * .085; p.y += move.y * .085; }
    p.x = clamp(p.x, -11.55, 11.55); p.y = clamp(p.y, -8.55, 8.55);
    if ((input.buttons & Buttons.PRIMARY) && p.fireCooldown === 0) {
      const angle = Math.atan2(p.aimY, p.aimX), count = p.level >= 5 ? 5 : p.level >= 3 ? 3 : 1;
      for (let i = 0; i < count; i++) shoot(p.x + p.aimX * .6, p.y + p.aimY * .6,
        angle + (i - (count - 1) / 2) * .135, .34, false, 5 + p.level, .115);
      p.fireCooldown = Math.max(7, 10 - Math.floor(p.level / 2)); signal("shot");
    }
    if (!state.bossSpawned) {
      const wave = Math.min(5, 1 + Math.floor(state.tick / 720));
      if (wave !== state.wave) { state.wave = wave; state.waveBanner = 150; }
      if (state.tick >= BOSS_TICK) {
        state.bossSpawned = true; state.wave = 6; state.waveBanner = 180;
        state.enemies = []; state.bullets = state.bullets.filter(b => !b.hostile);
        spawn("boss", 0, -5.2); signal("boss", 1);
      } else if (--state.spawnCountdown <= 0) {
        const roll = random();
        const kind = state.wave >= 3 && roll > .77 ? "brute" : state.wave >= 2 && roll > .43 ? "gunner" : "drone";
        spawn(kind); state.spawnCountdown = 103 - state.wave * 12;
        if (state.wave >= 4 && state.enemies.length < 16 && random() > .45) spawn("drone");
      }
    } else if (state.tick % 420 === 0 && state.enemies.length < 7) spawn(state.tick % 840 === 0 ? "gunner" : "drone");
    updateEnemies();
    if (state.status === "playing") updateBullets();
    if (state.status === "playing") updatePickups();
    state.effects = state.effects.filter(e => --e.ttl > 0);
    if (state.tick >= MAX_TICKS && state.status === "playing") { state.status = "gameover"; signal("lose"); }
    return events;
  }
  return { state, step };
}

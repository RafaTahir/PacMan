import { Buttons, DT, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from "../../shared/contracts";
import { axis, clamp, seededRandom } from "../../shared/math";
export const FIELD = { width: 28, height: 22 };
export interface Rock {
  composition?: "ore" | "dense" | "volatile";
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  spin: number;
  size: number;
}
export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
export interface Ore {
  x: number;
  y: number;
  life: number;
  value: number;
}
export interface OrbitState extends ArcadeState {
  rig: number;
  recovered: number;
  wreck: null | { x: number; y: number; vx: number; vy: number; towed: boolean; expires: number };
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    hull: number;
    invincible: number;
    shield: number;
    shieldActive: boolean;
    heat: number;
    overheated: boolean;
  };
  rocks: Rock[];
  shots: Shot[];
  ore: Ore[];
  cargo: number;
  delivered: number;
  wave: number;
  nextWave: number;
  kills: number;
  hitSerial: number;
  lastHit: { x: number; y: number };
  message: string;
  messageUntil: number;
}
const wrap = (v: number, half: number) => ((((v + half) % (2 * half)) + 2 * half) % (2 * half)) - half;
export const cargoCapacity = (s: OrbitState) => (s.rig >= 1 ? 16 : 12);
export function createSimulation(seed: number): ArcadeSimulation<OrbitState> {
  const random = seededRandom(seed);
  let nextId = 0,
    cooldown = 0,
    refineryCooldown = 0;
  const state: OrbitState = {
    rig: 0,
    recovered: 0,
    wreck: null,
    seed,
    tick: 0,
    score: 0,
    status: "playing",
    player: { x: 0, y: 3, vx: 0, vy: 0, angle: 0, hull: 4, invincible: 180, shield: 100, shieldActive: false, heat: 0, overheated: false },
    rocks: [],
    shots: [],
    ore: [],
    cargo: 0,
    delivered: 0,
    wave: 0,
    nextWave: 1,
    kills: 0,
    hitSerial: 0,
    lastHit: { x: 0, y: 0 },
    message: "BREAK ROCKS · COLLECT ORE · RETURN TO REFINERY",
    messageUntil: 300,
  };
  const emitHit = (x: number, y: number) => {
    state.lastHit = { x, y };
    state.hitSerial++;
  };
  function rock(size: number, x?: number, y?: number, composition?: Rock["composition"]) {
    if (state.rocks.length >= 38) return;
    composition ??= nextId % 7 === 0 ? "volatile" : nextId % 4 === 0 ? "dense" : "ore";
    const angle = random() * Math.PI * 2,
      speed = 1 + random() * 1.3 + state.wave * 0.12;
    state.rocks.push({
      id: nextId++,
      composition,
      x: x ?? (random() < 0.5 ? -13.8 : 13.8),
      y: y ?? random() * 20 - 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: size === 2 ? 1.15 : size === 1 ? 0.66 : 0.38,
      hp: size + 1 + (composition === "dense" ? 1 : 0),
      spin: random() * 6.28,
      size,
    });
  }
  function destroy(r: Rock, events: GameSignal[]) {
    state.kills++;
    state.score += (3 - r.size) * 40;
    emitHit(r.x, r.y);
    events.push({ type: "hit" });
    if (r.composition === "volatile") {
      for (const other of state.rocks) if (other !== r && Math.hypot(other.x - r.x, other.y - r.y) < 2.8) other.hp = Math.max(1, other.hp - 2);
      state.message = "VOLATILE SHOCK · NEARBY ARMOR CRACKED";
      state.messageUntil = state.tick + 100;
    }
    if (r.size > 0) for (let n = 0; n < 2; n++) rock(r.size - 1, r.x + (n ? 1 : -1) * 0.25, r.y, r.composition);
    else if (state.ore.length < 48) state.ore.push({ x: r.x, y: r.y, life: 1200, value: r.composition === "dense" ? 2 : 1 });
  }
  return {
    state,
    step(input: Readonly<ArcadeInput>) {
      if (state.status !== "playing") return [];
      const events: GameSignal[] = [];
      state.tick++;
      const p = state.player;
      if (state.tick >= state.nextWave) {
        state.wave++;
        state.nextWave = state.tick + 960;
        for (let i = 0; i < Math.min(6, 2 + state.wave); i++) rock(2);
        state.message = `SALVAGE WAVE ${state.wave}`;
        state.messageUntil = state.tick + 150;
        events.push({ type: "boss" });
      }
      if (p.invincible > 0) p.invincible--;
      if (cooldown > 0) cooldown--;
      if (refineryCooldown > 0) refineryCooldown--;
      const ix = axis(input.x),
        iy = axis(input.y),
        buttons = Number.isFinite(input.buttons) ? input.buttons & 15 : 0;
      const length = Math.max(127, Math.hypot(ix, iy)),
        mass = 1 + state.cargo * 0.025;
      p.vx = (p.vx + (((ix / length) * 12) / mass) * DT) * 0.985;
      p.vy = (p.vy + (((iy / length) * 12) / mass) * DT) * 0.985;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 6.7) {
        p.vx *= 6.7 / speed;
        p.vy *= 6.7 / speed;
      }
      p.x = wrap(p.x + p.vx * DT, 14);
      p.y = wrap(p.y + p.vy * DT, 11);
      if (Math.hypot(axis(input.aimX), axis(input.aimY)) > 10) p.angle = Math.atan2(axis(input.aimY), axis(input.aimX)) + Math.PI / 2;
      p.shieldActive = Boolean(buttons & Buttons.SECONDARY) && p.shield > 1;
      p.shield = clamp(p.shield + (p.shieldActive ? (state.wreck?.towed ? -18 : -35) : state.rig >= 3 ? 20 : 12) * DT, 0, 100);
      p.heat = Math.max(0, p.heat - (buttons & Buttons.PRIMARY ? (state.rig >= 2 ? 18 : 11) : 32) * DT);
      if (p.heat < 25) p.overheated = false;
      if (buttons & Buttons.PRIMARY && !cooldown && !p.overheated && state.shots.length < 34) {
        const dx = Math.sin(p.angle),
          dy = -Math.cos(p.angle);
        for (const side of state.rig >= 2 ? [-1, 1] : [0])
          if (state.shots.length < 34)
            state.shots.push({
              x: p.x + dx * 0.5 - dy * side * 0.2,
              y: p.y + dy * 0.5 + dx * side * 0.2,
              vx: dx * 22 + p.vx * 0.35,
              vy: dy * 22 + p.vy * 0.35,
              life: 65,
            });
        cooldown = 8;
        p.heat += 12;
        if (p.heat >= 100) p.overheated = true;
        events.push({ type: "shot" });
      }
      const removed = new Set<Rock>(),
        activeRocks = [...state.rocks];
      for (const r of activeRocks) {
        r.x = wrap(r.x + r.vx * DT, 14);
        r.y = wrap(r.y + r.vy * DT, 11);
        r.spin += DT * (r.id % 2 ? 1 : -1) * 0.3;
        if (Math.hypot(p.x - r.x, p.y - r.y) < r.radius + 0.35) {
          if (p.shieldActive && p.shield > 0) {
            removed.add(r);
            destroy(r, events);
            p.shield = Math.max(0, p.shield - 8);
            if (p.shield === 0) p.shieldActive = false;
          } else if (!p.invincible) {
            p.hull--;
            p.invincible = 100;
            p.vx *= -0.6;
            p.vy *= -0.6;
            state.cargo = Math.max(0, state.cargo - 2);
            emitHit(p.x, p.y);
            events.push({ type: "death" });
            if (state.wreck) state.wreck.towed = false;
            state.message = "HULL HIT · CARGO LOST";
            state.messageUntil = state.tick + 120;
          }
        }
      }
      for (const b of state.shots) {
        const oldX = b.x,
          oldY = b.y;
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        b.life--;
        for (const r of activeRocks) {
          if (removed.has(r)) continue;
          const dx = b.x - oldX,
            dy = b.y - oldY,
            t = clamp(((r.x - oldX) * dx + (r.y - oldY) * dy) / (dx * dx + dy * dy || 1), 0, 1);
          if (Math.hypot(r.x - oldX - dx * t, r.y - oldY - dy * t) < r.radius + 0.09) {
            b.life = 0;
            r.hp--;
            emitHit(r.x, r.y);
            if (r.hp <= 0) {
              removed.add(r);
              destroy(r, events);
            }
            break;
          }
        }
      }
      state.rocks = state.rocks.filter((r) => !removed.has(r));
      state.shots = state.shots.filter((b) => b.life > 0 && Math.abs(b.x) < 15 && Math.abs(b.y) < 12);
      for (const o of state.ore) {
        o.life--;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < (state.rig >= 1 ? 4.1 : 2.7) && d > 0.1) {
          o.x += (p.x - o.x) * DT * 2;
          o.y += (p.y - o.y) * DT * 2;
        }
        if (d < 0.65 && state.cargo < cargoCapacity(state)) {
          const take = Math.min(o.value, cargoCapacity(state) - state.cargo);
          state.cargo += take;
          o.value -= take;
          if (o.value === 0) o.life = 0;
          state.score += 25;
          events.push({ type: "score" });
        }
      }
      state.ore = state.ore.filter((o) => o.life > 0);
      if (state.tick % 1200 === 600 && !state.wreck) {
        const side = (state.seed + Math.floor(state.tick / 1200)) % 2 ? 1 : -1;
        state.wreck = { x: side * 6, y: -4, vx: -side * 0.2, vy: 0.1, towed: false, expires: state.tick + 1800 };
        state.message = "WRECK SIGNAL · HOLD SHIELD TO TOW";
        state.messageUntil = state.tick + 240;
      }
      const w = state.wreck;
      if (w) {
        if (state.tick > w.expires) {
          state.wreck = null;
          state.message = "WRECK SIGNAL LOST";
          state.messageUntil = state.tick + 120;
        } else {
          const distance = Math.hypot(w.x - p.x, w.y - p.y);
          if (p.shieldActive && distance < 2.4) w.towed = true;
          if (!p.shieldActive || distance > 5) w.towed = false;
          if (w.towed) {
            w.vx += (p.x - w.x) * 5 * DT;
            w.vy += (p.y - w.y) * 5 * DT;
            w.vx *= 0.94;
            w.vy *= 0.94;
          }
          w.x = wrap(w.x + w.vx * DT, 14);
          w.y = wrap(w.y + w.vy * DT, 11);
          if (w.towed && Math.hypot(w.x, w.y) < 1.65 && Math.hypot(p.x, p.y) < 2 && Math.hypot(p.vx, p.vy) < 3.2) {
            state.recovered++;
            state.delivered += 4;
            state.score += 1200;
            state.wreck = null;
            p.shield = Math.min(100, p.shield + 35);
            state.message = "WRECK RECOVERED · 4 ORE BANKED";
            state.messageUntil = state.tick + 180;
            events.push({ type: "upgrade" });
          }
        }
      }
      if (state.cargo > 0 && Math.hypot(p.x, p.y) < 1.65 && Math.hypot(p.vx, p.vy) < 3.2 && !refineryCooldown) {
        const count = state.cargo;
        state.delivered += count;
        state.cargo = 0;
        state.score += count * 200;
        refineryCooldown = 90;
        p.shield = Math.min(100, p.shield + 25);
        state.message = `${count} ORE REFINED · ${state.delivered}/24`;
        state.messageUntil = state.tick + 180;
        events.push({ type: "chain", value: count });
      }
      const rig = state.delivered >= 18 ? 3 : state.delivered >= 12 ? 2 : state.delivered >= 6 ? 1 : 0;
      if (rig > state.rig) {
        state.rig = rig;
        if (rig === 3 && p.hull > 0) p.hull = Math.min(4, p.hull + 2);
        state.message = ["", "TRACTOR RIG · 16 CARGO · WIDER PICKUP", "TWIN CANNON · IMPROVED COOLING", "SHIELD REFIT · HULL REPAIRED"][rig];
        state.messageUntil = state.tick + 240;
        events.push({ type: "upgrade", value: rig });
      }
      if (p.hull <= 0) {
        state.status = "gameover";
        events.push({ type: "lose" });
      } else if (state.delivered >= 24) {
        state.status = "victory";
        state.score += Math.max(0, MAX_TICKS - state.tick);
        events.push({ type: "win" });
      } else if (state.tick >= MAX_TICKS) {
        state.status = state.delivered >= 12 ? "victory" : "gameover";
        events.push({ type: state.status === "victory" ? "win" : "lose" });
      }
      return events;
    },
  };
}

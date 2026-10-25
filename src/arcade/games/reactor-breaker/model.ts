import { Buttons, DT, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from "../../shared/contracts";
import { axis, clamp, seededRandom } from "../../shared/math";

export const BOARD = { halfWidth: 8, top: -9.5, bottom: 10.2, paddleY: 8.35, paddleHalfWidth: 1.45, ballRadius: 0.2 } as const;
export const LIMITS = { balls: 3, particles: 144, drops: 5, bursts: 16, towers: 28, score: 9_999_999 } as const;
export const STAGE_COUNT = 3;
export type TowerKind = "core" | "armored" | "volatile" | "capacitor";
export interface Tower {
  id: number; x: number; y: number; halfWidth: number; halfDepth: number;
  kind: TowerKind; layers: number; maxLayers: number; hp: number; layerHp: number; flash: number;
}
export interface Ball { id: number; x: number; y: number; prevX: number; prevY: number; vx: number; vy: number; radius: number; trail: { x: number; y: number }[] }
export interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; maxLife: number; color: number; size: number }
export type DropKind = "wide" | "multiball" | "shield";
export interface Drop { id: number; x: number; y: number; kind: DropKind; age: number }
export interface Burst { x: number; y: number; radius: number; life: number; maxLife: number; color: number }
export interface ReactorState extends ArcadeState {
  stage: number; lives: number; towers: Tower[]; balls: Ball[]; particles: Particle[]; drops: Drop[]; bursts: Burst[];
  paddle: { x: number; prevX: number; velocity: number; halfWidth: number };
  energy: number; pulseCharge: number; pulseArmed: number; pulseStrength: number; shield: number; wideTicks: number;
  combo: number; comboTicks: number; layersBroken: number; stageClearTicks: number; serveTicks: number; message: string;
}
export interface SweepHit { time: number; nx: number; ny: number }
const EPS = 0.00001;
const COLORS: Record<TowerKind, number> = { core: 0x38dce4, armored: 0x8999d8, volatile: 0xff8b43, capacitor: 0xd8f65a };

/** Exact continuous circle/rectangle contact, including the four rounded corners. */
export function sweepCircleAabb(x: number, y: number, vx: number, vy: number, radius: number, maxTime: number, left: number, top: number, right: number, bottom: number): SweepHit | null {
  const nearestX = clamp(x, left, right), nearestY = clamp(y, top, bottom);
  const dx = x - nearestX, dy = y - nearestY;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared < radius * radius - EPS) {
    if (distanceSquared > EPS * EPS) {
      const inverse = 1 / Math.sqrt(distanceSquared);
      return { time: 0, nx: dx * inverse, ny: dy * inverse };
    }
    const distances = [x - left, right - x, y - top, bottom - y];
    const side = distances.indexOf(Math.min(...distances));
    return { time: 0, nx: side === 0 ? -1 : side === 1 ? 1 : 0, ny: side === 2 ? -1 : side === 3 ? 1 : 0 };
  }
  let hit: SweepHit | null = null;
  const consider = (time: number, nx: number, ny: number) => {
    if (time >= -EPS && time <= maxTime + EPS && vx * nx + vy * ny < -EPS && (!hit || time < hit.time)) hit = { time: Math.max(0, time), nx, ny };
  };
  if (vx > EPS) {
    const t = (left - radius - x) / vx, atY = y + vy * t;
    if (atY >= top - EPS && atY <= bottom + EPS) consider(t, -1, 0);
  } else if (vx < -EPS) {
    const t = (right + radius - x) / vx, atY = y + vy * t;
    if (atY >= top - EPS && atY <= bottom + EPS) consider(t, 1, 0);
  }
  if (vy > EPS) {
    const t = (top - radius - y) / vy, atX = x + vx * t;
    if (atX >= left - EPS && atX <= right + EPS) consider(t, 0, -1);
  } else if (vy < -EPS) {
    const t = (bottom + radius - y) / vy, atX = x + vx * t;
    if (atX >= left - EPS && atX <= right + EPS) consider(t, 0, 1);
  }
  const a = vx * vx + vy * vy;
  if (a < EPS) return hit;
  for (let corner = 0; corner < 4; corner++) {
    const cx = corner & 1 ? right : left, cy = corner & 2 ? bottom : top;
    const ox = x - cx, oy = y - cy, b = 2 * (ox * vx + oy * vy), c = ox * ox + oy * oy - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) continue;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (t < -EPS || t > maxTime + EPS) continue;
    const px = x + vx * t - cx, py = y + vy * t - cy;
    if ((corner & 1 ? px >= -EPS : px <= EPS) && (corner & 2 ? py >= -EPS : py <= EPS)) consider(t, px / radius, py / radius);
  }
  return hit;
}

export function createSimulation(seed: number): ArcadeSimulation<ReactorState> {
  const random = seededRandom(seed);
  let nextBallId = 1, nextDropId = 1, secondaryWasDown = false, secondaryLatched = false;
  let signals: GameSignal[] = [];
  const state: ReactorState = {
    seed: seed >>> 0, tick: 0, score: 0, status: "playing", stage: 1, lives: 3, towers: [], balls: [], particles: [], drops: [], bursts: [],
    paddle: { x: 0, prevX: 0, velocity: 0, halfWidth: BOARD.paddleHalfWidth }, energy: 45, pulseCharge: 0, pulseArmed: 0, pulseStrength: 0,
    shield: 1, wideTicks: 0, combo: 0, comboTicks: 0, layersBroken: 0, stageClearTicks: 0, serveTicks: 0, message: "LAUNCH INTO THE CORE",
  };
  const emit = (type: GameSignal["type"], value?: number) => { if (signals.length < 32) signals.push(value === undefined ? { type } : { type, value }); };
  const addScore = (amount: number) => { state.score = Math.min(LIMITS.score, state.score + Math.max(0, Math.floor(amount))); };
  const speed = () => Math.min(19, 10 + (state.stage - 1) * 1.45 + state.tick / 2400);
  const makeBall = (x: number, y: number, vx: number, vy: number): Ball => ({ id: nextBallId++, x, y, prevX: x, prevY: y, vx, vy, radius: BOARD.ballRadius, trail: [] });
  const particles = (x: number, y: number, color: number, count: number, force = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2, velocity = (0.7 + random() * 2.7) * force, life = 22 + Math.floor(random() * 24);
      const particle: Particle = { x, y, z: 0.25 + random() * 0.8, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, vz: (1.5 + random() * 3) * force, life, maxLife: life, color, size: 0.035 + random() * 0.06 };
      if (state.particles.length >= LIMITS.particles) state.particles.shift();
      state.particles.push(particle);
    }
  };
  const burst = (x: number, y: number, radius: number, color: number) => {
    if (state.bursts.length >= LIMITS.bursts) state.bursts.shift();
    state.bursts.push({ x, y, radius, color, life: 25, maxLife: 25 });
  };
  const buildStage = () => {
    state.towers = [];
    for (let row = 0; row < 4; row++) for (let column = 0; column < 7; column++) {
      const roll = random();
      const kind: TowerKind = (column + row + state.stage) % 7 === 0 ? "capacitor" : roll < 0.25 ? "volatile" : roll < 0.46 + state.stage * 0.025 ? "armored" : "core";
      const layers = Math.min(4, 1 + Math.floor((3 - row) / 2) + (state.stage > 1 ? 1 : 0) + (state.stage === 3 && column % 2 === 0 ? 1 : 0));
      const layerHp = kind === "armored" ? 2 : 1;
      state.towers.push({ id: row * 7 + column, x: (column - 3) * 2.08, y: -6.6 + row * 1.72, halfWidth: 0.83, halfDepth: 0.58, kind, layers, maxLayers: layers, hp: layerHp, layerHp, flash: 0 });
    }
    state.balls = [];
    state.drops = [];
    state.pulseArmed = 0;
    state.pulseStrength = 0;
    state.serveTicks = 24;
    state.message = state.stage === 1 ? "LAUNCH INTO THE CORE" : `SECTOR ${state.stage} · LAUNCH`;
  };
  const spawnDrop = (tower: Tower) => {
    if (state.drops.length >= LIMITS.drops) return;
    const roll = random();
    state.drops.push({ id: nextDropId++, x: tower.x, y: tower.y, kind: roll < 0.38 ? "wide" : roll < 0.76 ? "multiball" : "shield", age: 0 });
  };
  const damageTower = (tower: Tower, damage: number, chainDepth: number, explosionQueue: Tower[]) => {
    if (tower.layers <= 0) return;
    tower.flash = 9;
    let broken = 0;
    while (damage > 0 && tower.layers > 0) {
      const dealt = Math.min(tower.hp, damage);
      tower.hp -= dealt;
      damage -= dealt;
      if (tower.hp <= 0) {
        tower.layers--;
        tower.hp = tower.layers > 0 ? tower.layerHp : 0;
        broken++;
        state.layersBroken++;
        state.combo = Math.min(12, state.combo + 1);
        state.comboTicks = 210;
        state.energy = Math.min(100, state.energy + 3);
        addScore((45 + state.stage * 15) * (1 + Math.floor(state.combo / 3)) + chainDepth * 30);
      }
    }
    particles(tower.x, tower.y, COLORS[tower.kind], broken ? 7 : 3, broken ? 1.25 : 0.6);
    if (broken) emit("score", state.combo);
    if (tower.layers === 0) {
      addScore(90 * state.stage);
      if (tower.kind === "volatile") explosionQueue.push(tower);
      if (tower.kind === "capacitor") {
        state.energy = Math.min(100, state.energy + 22);
        spawnDrop(tower);
        emit("upgrade");
      } else if (state.layersBroken % 13 === 0) spawnDrop(tower);
    }
  };
  const hitTower = (tower: Tower, damage: number, pulseRadius = 0) => {
    const queue: Tower[] = [];
    damageTower(tower, damage, 0, queue);
    if (pulseRadius > 0) {
      burst(tower.x, tower.y, pulseRadius, 0xb8ffed);
      particles(tower.x, tower.y, 0xb8ffed, 20, 1.8);
      for (const neighbor of state.towers) {
        if (neighbor.id !== tower.id && neighbor.layers > 0 && Math.hypot(neighbor.x - tower.x, neighbor.y - tower.y) <= pulseRadius) damageTower(neighbor, 1 + (pulseRadius > 3 ? 1 : 0), 1, queue);
      }
      emit("boost");
    }
    // Each volatile tower can enter this queue once: destruction removes its layers first.
    for (let index = 0; index < queue.length && index < LIMITS.towers; index++) {
      const exploding = queue[index];
      const radius = 2.45;
      burst(exploding.x, exploding.y, radius, COLORS.volatile);
      particles(exploding.x, exploding.y, COLORS.volatile, 13, 1.7);
      for (const neighbor of state.towers) {
        if (neighbor.layers > 0 && Math.hypot(neighbor.x - exploding.x, neighbor.y - exploding.y) <= radius) damageTower(neighbor, 2, index + 1, queue);
      }
    }
    emit(queue.length > 0 ? "chain" : "hit", queue.length || damage);
  };
  const activatePulse = () => {
    if (state.energy < 30 || state.pulseCharge < 8 || state.pulseArmed > 0) { state.pulseCharge = 0; return; }
    const charge = state.pulseCharge;
    const mega = charge >= 42 && state.energy >= 55;
    state.energy = Math.max(0, state.energy - (mega ? 55 : 30));
    state.pulseStrength = mega ? 2 : 1;
    state.pulseArmed = 480;
    state.pulseCharge = 0;
    state.message = state.pulseStrength === 2 ? "MEGA PULSE ARMED" : "PULSE ARMED";
    emit("boost", state.pulseStrength);
  };
  const launch = (horizontal: number) => {
    const launchX = clamp(horizontal * 0.65 + (state.seed % 2 ? 0.22 : -0.22), -0.7, 0.7);
    const velocity = speed();
    state.balls.push(makeBall(state.paddle.x, BOARD.paddleY - 0.55, launchX * velocity, -Math.sqrt(1 - launchX * launchX) * velocity));
    state.message = "BREAK THE REACTOR STACKS";
    emit("shot");
  };
  const advanceBall = (ball: Ball) => {
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    if (ball.trail.length >= 9) ball.trail.shift();
    ball.trail.push({ x: ball.x, y: ball.y });
    let remaining = DT;
    for (let iteration = 0; remaining > EPS && iteration < 12; iteration++) {
      let earliest: SweepHit | null = null;
      let target: Tower | "wall" | "paddle" | "shield" | null = null;
      const choose = (hit: SweepHit | null, candidate: typeof target) => {
        if (hit && hit.time <= remaining + EPS && ball.vx * hit.nx + ball.vy * hit.ny < -EPS && (!earliest || hit.time < earliest.time)) { earliest = hit; target = candidate; }
      };
      if (ball.vx < -EPS) choose({ time: Math.max(0, (-BOARD.halfWidth + ball.radius - ball.x) / ball.vx), nx: 1, ny: 0 }, "wall");
      if (ball.vx > EPS) choose({ time: Math.max(0, (BOARD.halfWidth - ball.radius - ball.x) / ball.vx), nx: -1, ny: 0 }, "wall");
      if (ball.vy < -EPS) choose({ time: Math.max(0, (BOARD.top + ball.radius - ball.y) / ball.vy), nx: 0, ny: 1 }, "wall");
      if (ball.vy > EPS && state.shield > 0) choose({ time: Math.max(0, (BOARD.bottom - ball.radius - ball.y) / ball.vy), nx: 0, ny: -1 }, "shield");
      if (ball.vy > 0 && ball.y < BOARD.paddleY + 0.16) choose(sweepCircleAabb(ball.x, ball.y, ball.vx, ball.vy, ball.radius, remaining, state.paddle.x - state.paddle.halfWidth, BOARD.paddleY - 0.16, state.paddle.x + state.paddle.halfWidth, BOARD.paddleY + 0.16), "paddle");
      for (const tower of state.towers) if (tower.layers > 0) choose(sweepCircleAabb(ball.x, ball.y, ball.vx, ball.vy, ball.radius, remaining, tower.x - tower.halfWidth, tower.y - tower.halfDepth, tower.x + tower.halfWidth, tower.y + tower.halfDepth), tower);
      if (!earliest || !target) { ball.x += ball.vx * remaining; ball.y += ball.vy * remaining; break; }
      // TypeScript does not track assignments inside choose().
      const contact = earliest as SweepHit, object = target as Tower | "wall" | "paddle" | "shield";
      ball.x += ball.vx * contact.time;
      ball.y += ball.vy * contact.time;
      remaining -= contact.time;
      if (object === "paddle") {
        const impact = clamp((ball.x - state.paddle.x) / state.paddle.halfWidth, -1, 1);
        const velocity = speed(), angle = impact * 1.07;
        ball.vx = clamp(Math.sin(angle) * velocity + state.paddle.velocity * 0.12, -velocity * 0.91, velocity * 0.91);
        ball.vy = -Math.sqrt(velocity * velocity - ball.vx * ball.vx);
        ball.y = Math.min(ball.y, BOARD.paddleY - 0.16 - ball.radius - EPS * 10);
        particles(ball.x, ball.y, 0x8affec, 4, 0.55);
        emit("bounce", Math.abs(impact));
      } else {
        const dot = ball.vx * contact.nx + ball.vy * contact.ny;
        ball.vx -= 2 * dot * contact.nx;
        ball.vy -= 2 * dot * contact.ny;
        if (object === "shield") {
          state.shield--;
          state.message = "SAFETY FIELD CAUGHT YOU";
          burst(ball.x, BOARD.bottom - 0.25, 2.5, 0x63e8ff);
          emit("near-miss");
        } else if (object !== "wall") {
          const armed = state.pulseArmed > 0;
          hitTower(object, armed ? 2 + state.pulseStrength : 1, armed ? state.pulseStrength === 2 ? 3.65 : 2.55 : 0);
          if (armed) { state.pulseArmed = 0; state.pulseStrength = 0; }
          // A vertical component prevents an indefinitely horizontal orbit.
          const velocity = Math.hypot(ball.vx, ball.vy);
          if (Math.abs(ball.vy) < velocity * 0.24) {
            ball.vy = (ball.vy < 0 ? -1 : 1) * velocity * 0.24;
            ball.vx = (ball.vx < 0 ? -1 : 1) * velocity * Math.sqrt(1 - 0.24 * 0.24);
          }
        }
      }
      ball.x += contact.nx * EPS * 12;
      ball.y += contact.ny * EPS * 12;
      // Consume a tiny interval on zero-time corner contacts to guarantee progress.
      remaining = Math.max(0, remaining - EPS);
    }
  };
  const catchDrop = (drop: Drop) => {
    addScore(150);
    if (drop.kind === "wide") { state.wideTicks = 900; state.message = "WIDE PADDLE · 15 SECONDS"; }
    if (drop.kind === "shield") { state.shield = Math.min(2, state.shield + 1); state.energy = Math.min(100, state.energy + 10); state.message = "SAFETY FIELD RESTORED"; }
    if (drop.kind === "multiball") {
      const source = state.balls[0];
      if (source) {
        const velocity = speed();
        for (const direction of [-1, 1]) if (state.balls.length < LIMITS.balls) state.balls.push(makeBall(source.x, source.y, direction * velocity * 0.62, -velocity * 0.7846018098));
        emit("multiball");
      } else state.energy = Math.min(100, state.energy + 25);
      state.message = "MULTIBALL · KEEP ONE ALIVE";
    }
    particles(drop.x, drop.y, 0xd8f65a, 12);
    emit("upgrade");
  };
  buildStage();
  state.serveTicks = 0;
  return {
    state,
    step(input) {
      signals = [];
      if (state.status !== "playing") return signals;
      state.tick++;
      const horizontal = axis(input.x) / 127, aim = axis(input.aimX) / 127;
      const buttons = Number.isFinite(input.buttons) ? input.buttons & 15 : 0;
      state.paddle.prevX = state.paddle.x;
      state.paddle.halfWidth = state.wideTicks > 0 ? 2.05 : BOARD.paddleHalfWidth;
      const paddleLimit = BOARD.halfWidth - state.paddle.halfWidth - 0.06;
      if (buttons & Buttons.POINTER) state.paddle.x += clamp(aim * paddleLimit - state.paddle.x, -18 * DT, 18 * DT);
      else state.paddle.x += horizontal * 14 * DT;
      state.paddle.x = clamp(state.paddle.x, -paddleLimit, paddleLimit);
      state.paddle.velocity = (state.paddle.x - state.paddle.prevX) / DT;
      state.energy = Math.min(100, state.energy + 0.035);
      if (state.wideTicks > 0) state.wideTicks--;
      if (state.pulseArmed > 0 && --state.pulseArmed === 0) state.pulseStrength = 0;
      if (state.comboTicks > 0 && --state.comboTicks === 0) state.combo = 0;
      const secondary = !!(buttons & Buttons.SECONDARY);
      if (secondary && !secondaryLatched && state.pulseArmed === 0) {
        state.pulseCharge = Math.min(60, state.pulseCharge + 1);
        if (state.pulseCharge === 60) { activatePulse(); secondaryLatched = true; }
      }
      if (!secondary) {
        if (secondaryWasDown && !secondaryLatched) activatePulse();
        secondaryLatched = false;
      }
      secondaryWasDown = secondary;
      for (const tower of state.towers) if (tower.flash > 0) tower.flash--;
      for (const particle of state.particles) {
        particle.x += particle.vx * DT; particle.y += particle.vy * DT; particle.z = Math.max(0.025, particle.z + particle.vz * DT); particle.vz -= 9 * DT; particle.life--;
      }
      state.particles = state.particles.filter(p => p.life > 0);
      for (const effect of state.bursts) effect.life--;
      state.bursts = state.bursts.filter(effect => effect.life > 0);
      if (state.stageClearTicks > 0) {
        state.stageClearTicks--;
        if (state.stageClearTicks === 0) {
          state.stage++;
          state.shield = Math.min(2, state.shield + 1);
          state.energy = Math.min(100, state.energy + 25);
          buildStage();
        }
      } else {
        if (state.serveTicks > 0) state.serveTicks--;
        if (state.balls.length === 0 && state.serveTicks === 0 && buttons & (Buttons.PRIMARY | Buttons.LAUNCH)) launch(horizontal);
        for (const ball of state.balls) advanceBall(ball);
        const before = state.balls.length;
        state.balls = state.balls.filter(ball => ball.y < BOARD.bottom + 0.9);
        if (before > 0 && state.balls.length === 0) {
          state.lives--;
          state.combo = 0; state.comboTicks = 0;
          state.serveTicks = 45;
          state.pulseArmed = 0; state.pulseStrength = 0;
          state.message = state.lives > 0 ? "CORE LOST · LAUNCH AGAIN" : "REACTOR OFFLINE";
          emit("death");
          if (state.lives <= 0) { state.status = "gameover"; emit("lose"); }
        }
        for (const drop of state.drops) {
          drop.y += 3.8 * DT; drop.age++;
          if (Math.abs(drop.y - BOARD.paddleY) < 0.45 && Math.abs(drop.x - state.paddle.x) < state.paddle.halfWidth + 0.25) { catchDrop(drop); drop.y = BOARD.bottom + 3; }
        }
        state.drops = state.drops.filter(drop => drop.y < BOARD.bottom + 0.5);
        if (state.status === "playing" && state.towers.every(tower => tower.layers === 0)) {
          addScore(1000 * state.stage);
          if (state.stage >= STAGE_COUNT) {
            addScore(state.lives * 500 + Math.floor((MAX_TICKS - state.tick) / 6));
            state.status = "victory"; state.message = "ALL REACTORS STABILIZED"; emit("win");
          } else {
            state.balls = []; state.drops = []; state.stageClearTicks = 72; state.message = `SECTOR ${state.stage} STABILIZED`; emit("upgrade");
          }
        }
      }
      if (state.tick >= MAX_TICKS && state.status === "playing") { state.status = "gameover"; state.message = "SHIFT COMPLETE · TIME UP"; emit("lose"); }
      return signals;
    },
  };
}

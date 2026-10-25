import { Buttons, DT, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from "../../shared/contracts";
import { clamp, seededRandom } from "../../shared/math";

export const BALL_RADIUS = 0.155;
export const TABLE = { left: -4.45, right: 4.45, top: -7.05, drain: 7.45 } as const;
export type BallMode = "plunger" | "table" | "ramp" | "air";
export interface PinballBall {
  id: number; x: number; y: number; z: number; px: number; py: number; pz: number;
  vx: number; vy: number; vz: number; mode: BallMode;
  rampDistance: number; rampSpeed: number; contactCooldown: number;
  launchedAt: number; skillShot: boolean; saveEligible: boolean;
}
export interface Flipper { x: number; y: number; length: number; angle: number; previousAngle: number; omega: number }
export interface PinballState extends ArcadeState {
  balls: PinballBall[]; flippers: [Flipper, Flipper]; ballsRemaining: number; ballNumber: number;
  multiplier: number; targetBits: number; rampShots: number; jackpots: number; multiball: boolean;
  ballSaveUntil: number; serveAt: number; plungerCharge: number; tilt: number; tilted: boolean;
  nudgeCooldown: number; bumperFlash: number[]; targetFlash: number[]; slingFlash: number[];
  hitSerial: number; lastHit: { x: number; y: number; z: number }; message: string; messageUntil: number;
  contacts: number;
}
export interface Rail { ax: number; ay: number; bx: number; by: number; sling?: number }
export const RAILS: readonly Rail[] = [
  { ax: -4.45, ay: 6.9, bx: -4.45, by: -5.85 },
  { ax: -4.45, ay: -5.85, bx: -3.25, by: -7.05 },
  { ax: -3.25, ay: -7.05, bx: 3.25, by: -7.05 },
  { ax: 3.25, ay: -7.05, bx: 4.45, by: -5.85 },
  { ax: 4.45, ay: -5.85, bx: 4.45, by: 7.1 },
  { ax: 3.58, ay: -4.65, bx: 3.58, by: 7.1 },
  { ax: -4.4, ay: 3.2, bx: -2.2, by: 5.08 },
  { ax: 3.53, ay: 3.35, bx: 2.2, by: 5.08 },
  { ax: -4.4, ay: 0.1, bx: -3.72, by: 1.1 },
  { ax: 3.53, ay: 0.1, bx: 3.15, by: 1.1 },
  { ax: -3.58, ay: 1.45, bx: -1.55, by: 3.55, sling: 0 },
  { ax: -1.55, ay: 3.55, bx: -3.58, by: 3.2, sling: 0 },
  { ax: -3.58, ay: 3.2, bx: -3.58, by: 1.45, sling: 0 },
  { ax: 3.1, ay: 1.45, bx: 1.55, by: 3.55, sling: 1 },
  { ax: 1.55, ay: 3.55, bx: 3.1, by: 3.2, sling: 1 },
  { ax: 3.1, ay: 3.2, bx: 3.1, by: 1.45, sling: 1 },
];
export const BUMPERS = [{ x: -1.3, y: -3.65, radius: 0.64 }, { x: 1.25, y: -3.15, radius: 0.64 }, { x: -0.05, y: -1.35, radius: 0.61 }] as const;
export const TARGETS = [{ x: -2.45, y: -6.05 }, { x: -0.15, y: -6.15 }, { x: 2.15, y: -6.05 }] as const;
/** The scoop constrains the ball to this real elevated wireform. Distance and
 * speed remain simulated; gravity can reverse an underpowered ramp shot. */
export const RAMP_POINTS = [
  { x: -2.75, y: -0.8, z: BALL_RADIUS },
  { x: -2.75, y: -3.65, z: 1.45 },
  { x: -2.45, y: -4.85, z: 2.0 },
  { x: -1.25, y: -5.35, z: 2.15 },
  { x: 0.2, y: -5.25, z: 2.1 },
  { x: 1.25, y: -4.65, z: 1.85 },
  { x: 1.85, y: -3.55, z: 1.45 },
  { x: 1.85, y: -1.5, z: 0.7 },
  { x: 1.15, y: -0.35, z: 0.28 },
] as const;
const rampLengths = RAMP_POINTS.slice(1).map((p, i) => Math.hypot(p.x - RAMP_POINTS[i].x, p.y - RAMP_POINTS[i].y, p.z - RAMP_POINTS[i].z));
export const RAMP_LENGTH = rampLengths.reduce((a, b) => a + b, 0);
export function rampPoint(distance: number): { x: number; y: number; z: number; tx: number; ty: number; tz: number } {
  let remaining = clamp(distance, 0, RAMP_LENGTH);
  for (let i = 0; i < rampLengths.length; i++) {
    const length = rampLengths[i];
    if (remaining <= length || i === rampLengths.length - 1) {
      const a = RAMP_POINTS[i], b = RAMP_POINTS[i + 1], t = remaining / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / length, ty: (b.y - a.y) / length, tz: (b.z - a.z) / length };
    }
    remaining -= length;
  }
  throw new Error("Invalid ramp distance");
}

interface Contact { t: number; nx: number; ny: number; push: number }
interface PreparedRail extends Rail {
  length: number; tx: number; ty: number; radius: number;
  minX: number; maxX: number; minY: number; maxY: number;
}
function prepareRail(rail: Rail, radius: number): PreparedRail {
  const ux = rail.bx - rail.ax, uy = rail.by - rail.ay, length = Math.hypot(ux, uy);
  return { ...rail, length, tx: ux / length, ty: uy / length, radius,
    minX: Math.min(rail.ax, rail.bx) - radius - 1e-9, maxX: Math.max(rail.ax, rail.bx) + radius + 1e-9,
    minY: Math.min(rail.ay, rail.by) - radius - 1e-9, maxY: Math.max(rail.ay, rail.by) + radius + 1e-9 };
}
// These values are invariant across every simulation and contact iteration.
const collisionRails = RAILS.map(rail => prepareRail(rail, BALL_RADIUS + (rail.sling === undefined ? 0.06 : 0.07)));
const collisionBumpers = BUMPERS.map(b => ({ ...b, radius: b.radius + BALL_RADIUS }));
const TARGET_RADIUS = 0.3 + BALL_RADIUS;
function sweepCircle(px: number, py: number, dx: number, dy: number, cx: number, cy: number, radius: number): Contact | undefined {
  const ox = px - cx, oy = py - cy, c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) { const d = Math.hypot(ox, oy); return { t: 0, nx: d > 1e-8 ? ox / d : 0, ny: d > 1e-8 ? oy / d : 1, push: radius - d + 0.0002 }; }
  const a = dx * dx + dy * dy, b = ox * dx + oy * dy, determinant = b * b - a * c;
  if (a < 1e-12 || b >= 0 || determinant < 0) return;
  const t = (-b - Math.sqrt(determinant)) / a;
  if (t < 0 || t > 1) return;
  return { t, nx: (ox + dx * t) / radius, ny: (oy + dy * t) / radius, push: 0.0002 };
}
/** Swept point versus a capsule, including rounded endpoints. */
export function sweepRail(px: number, py: number, dx: number, dy: number, rail: Rail, radius: number): Contact | undefined {
  return sweepPreparedRail(px, py, dx, dy, prepareRail(rail, radius));
}
function sweepPreparedRail(px: number, py: number, dx: number, dy: number, rail: PreparedRail): Contact | undefined {
  const { length, tx, ty, radius } = rail;
  const along = (px - rail.ax) * tx + (py - rail.ay) * ty;
  const nearest = clamp(along, 0, length);
  const ox = px - rail.ax - nearest * tx, oy = py - rail.ay - nearest * ty, distance = Math.hypot(ox, oy);
  if (distance < radius) return { t: 0, nx: distance > 1e-8 ? ox / distance : -ty, ny: distance > 1e-8 ? oy / distance : tx, push: radius - distance + 0.0002 };
  let best = sweepCircle(px, py, dx, dy, rail.ax, rail.ay, radius);
  const end = sweepCircle(px, py, dx, dy, rail.bx, rail.by, radius);
  if (end && (!best || end.t < best.t)) best = end;
  const signed = (px - rail.ax) * -ty + (py - rail.ay) * tx, speed = dx * -ty + dy * tx;
  if (Math.abs(speed) > 1e-12) {
    const side = signed >= 0 ? 1 : -1, t = (side * radius - signed) / speed;
    const u = along + (dx * tx + dy * ty) * t;
    if (t >= 0 && t <= 1 && u >= 0 && u <= length && signed * speed < 0 && (!best || t < best.t)) best = { t, nx: -ty * side, ny: tx * side, push: 0.0002 };
  }
  return best;
}

export function createSimulation(seed: number): ArcadeSimulation<PinballState> {
  const random = seededRandom(seed);
  let nextId = 1, previousButtons = 0;
  const state: PinballState = {
    seed: seed >>> 0, tick: 0, score: 0, status: "playing", balls: [],
    flippers: [{ x: -2.2, y: 5.08, length: 2, angle: 0.43, previousAngle: 0.43, omega: 0 }, { x: 2.2, y: 5.08, length: 2, angle: Math.PI - 0.43, previousAngle: Math.PI - 0.43, omega: 0 }],
    ballsRemaining: 3, ballNumber: 1, multiplier: 1, targetBits: 0, rampShots: 0, jackpots: 0, multiball: false,
    ballSaveUntil: 0, serveAt: 0, plungerCharge: 0, tilt: 0, tilted: false, nudgeCooldown: 0,
    bumperFlash: [0, 0, 0], targetFlash: [0, 0, 0], slingFlash: [0, 0],
    hitSerial: 0, lastHit: { x: 0, y: 0, z: 0 }, message: "HOLD LAUNCH · RELEASE TO PLUNGE", messageUntil: 360, contacts: 0,
  };
  let signals: GameSignal[] = [];
  const flipperRails = state.flippers.map(f => prepareRail({ ax: f.x, ay: f.y, bx: f.x + Math.cos(f.angle) * f.length, by: f.y + Math.sin(f.angle) * f.length }, BALL_RADIUS + 0.14));
  const announce = (message: string, duration = 150) => { state.message = message; state.messageUntil = state.tick + duration; };
  const award = (points: number) => { if (!state.tilted) { const value = points * state.multiplier; state.score += value; signals.push({ type: "score", value }); } };
  const flash = (ball: PinballBall) => { state.hitSerial++; state.lastHit = { x: ball.x, y: ball.y, z: ball.z }; state.contacts++; };
  function serve(auto = false, regular = false): PinballBall {
    const b: PinballBall = { id: nextId++, x: 4.02 + (random() - 0.5) * 0.03, y: 6.42, z: BALL_RADIUS, px: 4.02, py: 6.42, pz: BALL_RADIUS, vx: 0, vy: 0, vz: 0, mode: "plunger", rampDistance: 0, rampSpeed: 0, contactCooldown: 0, launchedAt: -999, skillShot: false, saveEligible: regular };
    state.balls.push(b);
    if (auto) launch(b, 1);
    return b;
  }
  function launch(ball: PinballBall, charge: number) {
    ball.mode = "table"; ball.vy = -(20 + 7 * charge); ball.vx = (random() - 0.5) * 0.18;
    ball.launchedAt = state.tick; ball.skillShot = true;
    state.plungerCharge = 0;
    if (ball.saveEligible && !state.tilted) state.ballSaveUntil = state.tick + 480;
    ball.saveEligible = false;
    announce(state.tilted ? "TILT · BALL IN PLAY" : state.ballSaveUntil > state.tick ? "BALL SAVE LIT · SHOOT THE THREE STAR TARGETS" : "SHOOT THE THREE STAR TARGETS"); signals.push({ type: "shot" });
  }
  serve(false, true);
  function completeRamp(ball: PinballBall) {
    state.rampShots++;
    if (state.multiball) { award(5000); state.jackpots++; announce("MIDNIGHT JACKPOT!"); signals.push({ type: "chain", value: state.multiplier }); }
    else if (state.targetBits === 7 && !state.tilted) {
      state.targetBits = 0; state.multiball = true; state.ballSaveUntil = state.tick + 600;
      state.multiplier = Math.min(5, state.multiplier + 1); award(2000);
      while (state.balls.length < 3) serve(true);
      announce("MIDNIGHT MULTIBALL · RAMPS SCORE JACKPOT", 240); signals.push({ type: "multiball" });
    } else { award(1500); announce("SKYLINE RAMP · LIGHT ALL THREE STARS"); signals.push({ type: "boost" }); }
    flash(ball);
  }
  function moveRamp(ball: PinballBall, dt: number) {
    const point = rampPoint(ball.rampDistance);
    ball.rampSpeed += (-9.8 * point.tz - ball.rampSpeed * 0.025) * dt;
    ball.rampDistance += ball.rampSpeed * dt;
    if (ball.rampDistance < 0) {
      ball.mode = "table"; ball.x = RAMP_POINTS[0].x; ball.y = RAMP_POINTS[0].y + 0.05; ball.z = BALL_RADIUS; ball.vx = 0; ball.vy = Math.max(3, -ball.rampSpeed); ball.contactCooldown = 12; return;
    }
    const next = rampPoint(ball.rampDistance);
    ball.x = next.x; ball.y = next.y; ball.z = next.z;
    ball.vx = next.tx * ball.rampSpeed; ball.vy = next.ty * ball.rampSpeed; ball.vz = next.tz * ball.rampSpeed;
    if (ball.rampDistance >= RAMP_LENGTH) { ball.mode = "air"; completeRamp(ball); ball.contactCooldown = 15; }
  }
  function moveTable(ball: PinballBall, dt: number) {
    if (ball.mode === "air") {
      ball.vz -= 9.8 * dt; ball.z += ball.vz * dt;
      if (ball.z <= BALL_RADIUS) { ball.z = BALL_RADIUS; ball.vz = 0; ball.mode = "table"; }
    }
    ball.vy += 7.2 * dt;
    const drag = 1 - 0.065 * dt; ball.vx *= drag; ball.vy *= drag;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 30) { ball.vx *= 30 / speed; ball.vy *= 30 / speed; }
    let remaining = dt;
    for (let iteration = 0; iteration < 5 && remaining > 1e-7; iteration++) {
      const dx = ball.vx * remaining, dy = ball.vy * remaining;
      let best: Contact | undefined, bestType = 0, bestIndex = 0;
      // The elevated wireform can cross above bumpers and table mechanisms.
      if (ball.z < 0.5) {
        // Conservative swept bounds only reject mechanisms the whole motion
        // segment cannot reach. Surviving contacts use the original sweep math.
        const endX = ball.x + dx, endY = ball.y + dy;
        const minX = Math.min(ball.x, endX), maxX = Math.max(ball.x, endX), minY = Math.min(ball.y, endY), maxY = Math.max(ball.y, endY);
        for (let i = 0; i < collisionRails.length; i++) {
          const rail = collisionRails[i];
          if (maxX < rail.minX || minX > rail.maxX || maxY < rail.minY || minY > rail.maxY) continue;
          const hit = sweepPreparedRail(ball.x, ball.y, dx, dy, rail);
          if (hit && (!best || hit.t < best.t)) { best = hit; bestType = 1; bestIndex = i; }
        }
        for (let i = 0; i < collisionBumpers.length; i++) {
          const b = collisionBumpers[i];
          if (maxX < b.x - b.radius || minX > b.x + b.radius || maxY < b.y - b.radius || minY > b.y + b.radius) continue;
          const hit = sweepCircle(ball.x, ball.y, dx, dy, b.x, b.y, b.radius);
          if (hit && (!best || hit.t < best.t)) { best = hit; bestType = 2; bestIndex = i; }
        }
        for (let i = 0; i < TARGETS.length; i++) {
          const t = TARGETS[i];
          if (maxX < t.x - TARGET_RADIUS || minX > t.x + TARGET_RADIUS || maxY < t.y - TARGET_RADIUS || minY > t.y + TARGET_RADIUS) continue;
          const hit = sweepCircle(ball.x, ball.y, dx, dy, t.x, t.y, TARGET_RADIUS);
          if (hit && (!best || hit.t < best.t)) { best = hit; bestType = 3; bestIndex = i; }
        }
        for (let i = 0; i < flipperRails.length; i++) {
          const rail = flipperRails[i];
          if (maxX < rail.minX || minX > rail.maxX || maxY < rail.minY || minY > rail.maxY) continue;
          const hit = sweepPreparedRail(ball.x, ball.y, dx, dy, rail);
          if (hit && (!best || hit.t < best.t)) { best = hit; bestType = 4; bestIndex = i; }
        }
      }
      if (!best) { ball.x += dx; ball.y += dy; break; }
      const hit = best, flipper = bestType === 4 ? state.flippers[bestIndex] : undefined;
      const sling = bestType === 1 ? RAILS[bestIndex].sling : undefined;
      ball.x += dx * hit.t + hit.nx * hit.push; ball.y += dy * hit.t + hit.ny * hit.push;
      let svx = 0, svy = 0, restitution = 0.74;
      if (flipper) { svx = -flipper.omega * (ball.y - flipper.y); svy = flipper.omega * (ball.x - flipper.x); restitution = 0.55; }
      const normalSpeed = (ball.vx - svx) * hit.nx + (ball.vy - svy) * hit.ny;
      if (normalSpeed < 0) {
        ball.vx -= (1 + restitution) * normalSpeed * hit.nx; ball.vy -= (1 + restitution) * normalSpeed * hit.ny;
        if (bestType === 2) {
          const index = bestIndex;
          if (state.bumperFlash[index] === 0 && !state.tilted) { const kick = Math.max(0, 11.5 - (ball.vx * hit.nx + ball.vy * hit.ny)); ball.vx += kick * hit.nx; ball.vy += kick * hit.ny; state.bumperFlash[index] = 10; award(100); flash(ball); signals.push({ type: "bounce" }); }
        } else if (bestType === 3) {
          const index = bestIndex;
          if (state.targetFlash[index] === 0 && !state.tilted) {
            state.targetFlash[index] = 18; const before = state.targetBits; state.targetBits |= 1 << index; award(500); flash(ball); signals.push({ type: "hit" });
            if (ball.skillShot && state.tick - ball.launchedAt < 180) { ball.skillShot = false; award(2000); announce("SKILL SHOT +2,000"); }
            if (state.targetBits === 7 && before !== 7) { award(1000); announce("LOCK LIT · SHOOT THE LEFT RAMP!", 240); signals.push({ type: "upgrade" }); }
          }
        } else if (sling !== undefined && state.slingFlash[sling] === 0 && !state.tilted) {
          state.slingFlash[sling] = 12; ball.vx += hit.nx * 4.2; ball.vy += hit.ny * 4.2; award(30); flash(ball); signals.push({ type: "bounce" });
        } else if (flipper && Math.abs(flipper.omega) > 2) { flash(ball); signals.push({ type: "hit" }); }
      }
      remaining *= 1 - hit.t;
      if (hit.t === 0) remaining = Math.max(0, remaining - 0.00004);
    }
    if (ball.mode === "table" && ball.contactCooldown === 0 && ball.vy < -5.5 && ball.py >= -0.9 && ball.y <= -0.8 && Math.abs(ball.x + 2.75) < 0.53) {
      ball.mode = "ramp"; ball.rampDistance = 0; ball.rampSpeed = Math.hypot(ball.vx, ball.vy); ball.vz = 0; announce("SKYLINE RAMP");
    }
  }
  return {
    state,
    step(input: Readonly<ArcadeInput>): readonly GameSignal[] {
      signals = [];
      if (state.status !== "playing") return signals;
      state.tick++;
      if (state.tick >= MAX_TICKS) { state.status = "gameover"; announce("LAST CALL · FINAL SCORE", 600); signals.push({ type: "lose" }); return signals; }
      for (const flashes of [state.bumperFlash, state.targetFlash, state.slingFlash]) for (let i = 0; i < flashes.length; i++) flashes[i] = Math.max(0, flashes[i] - 1);
      state.nudgeCooldown = Math.max(0, state.nudgeCooldown - 1); state.tilt = Math.max(0, state.tilt - 0.0007);
      if (state.serveAt > 0 && state.tick >= state.serveAt) { state.serveAt = 0; state.ballNumber++; state.tilted = false; state.tilt = 0; serve(false, true); announce("HOLD LAUNCH · RELEASE TO PLUNGE"); }
      if (!state.tilted && state.nudgeCooldown === 0 && Math.hypot(input.x, input.y) > 60 && state.balls.some(b => b.mode !== "plunger")) {
        const x = clamp(input.x / 127, -1, 1), y = clamp(input.y / 127, -1, 1);
        for (const b of state.balls) if (b.mode === "table" || b.mode === "air") { b.vx += x * 2.7; b.vy += y * 2.7; }
        state.tilt += 0.34; state.nudgeCooldown = 70; signals.push({ type: "dash" });
        if (state.tilt >= 1) { state.tilted = true; state.ballSaveUntil = 0; announce("TILT · FLIPPERS DISABLED", 360); signals.push({ type: "death" }); }
        else if (state.tilt > 0.6) announce("DANGER · LET THE TABLE SETTLE");
      }
      const plunger = state.balls.find(ball => ball.mode === "plunger");
      if (plunger) {
        if (input.buttons & Buttons.LAUNCH) state.plungerCharge = Math.min(1, state.plungerCharge + 1 / 65);
        // A quick tap still launches at useful power; holding tunes the skill shot.
        if (!(input.buttons & Buttons.LAUNCH) && (previousButtons & Buttons.LAUNCH)) launch(plunger, Math.max(0.38, state.plungerCharge));
      }
      previousButtons = input.buttons;
      for (const b of state.balls) { b.px = b.x; b.py = b.y; b.pz = b.z; b.contactCooldown = Math.max(0, b.contactCooldown - 1); }
      for (let i = 0; i < 2; i++) { const f = state.flippers[i]; f.previousAngle = f.angle; }
      for (let substep = 0; substep < 6; substep++) {
        const dt = DT / 6;
        for (let i = 0; i < 2; i++) {
          const f = state.flippers[i], pressed = !state.tilted && Boolean(input.buttons & (i === 0 ? Buttons.PRIMARY : Buttons.SECONDARY));
          const desired = i === 0 ? (pressed ? -0.43 : 0.43) : Math.PI + (pressed ? 0.43 : -0.43);
          const delta = clamp(desired - f.angle, -19 * dt, 19 * dt); f.angle += delta; f.omega = delta / dt;
          if (delta !== 0) flipperRails[i] = prepareRail({ ax: f.x, ay: f.y, bx: f.x + Math.cos(f.angle) * f.length, by: f.y + Math.sin(f.angle) * f.length }, BALL_RADIUS + 0.14);
        }
        // Snapshot the length: a ramp jackpot can add balls during this substep.
        const count = state.balls.length;
        for (let i = 0; i < count; i++) { const b = state.balls[i]; if (b.mode === "ramp") moveRamp(b, dt); else if (b.mode !== "plunger") moveTable(b, dt); }
        for (let i = 0; i < state.balls.length; i++) for (let j = i + 1; j < state.balls.length; j++) {
          const a = state.balls[i], b = state.balls[j];
          if (a.mode === "plunger" || b.mode === "plunger" || a.mode === "ramp" || b.mode === "ramp" || Math.abs(a.z - b.z) > BALL_RADIUS * 1.5) continue;
          const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < BALL_RADIUS * 2) { const nx = dx / distance, ny = dy / distance, push = (BALL_RADIUS * 2 - distance) / 2; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; const v = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (v < 0) { a.vx += v * nx * 0.93; a.vy += v * ny * 0.93; b.vx -= v * nx * 0.93; b.vy -= v * ny * 0.93; } }
        }
      }
      const drained = state.balls.filter(b => b.y > TABLE.drain || Math.abs(b.x) > 5.5 || b.y < -9);
      if (drained.length) {
        state.balls = state.balls.filter(b => !drained.includes(b));
        if (state.ballSaveUntil > state.tick && !state.tilted) { for (let i = 0; i < drained.length && state.balls.length < 3; i++) serve(state.balls.length > 0); announce("BALL SAVED · SHOOT AGAIN"); signals.push({ type: "boost" }); }
        else if (state.balls.length === 0) { state.ballsRemaining--; state.multiball = false; state.plungerCharge = 0; state.ballSaveUntil = 0; signals.push({ type: "death" }); if (state.ballsRemaining <= 0) { state.status = "gameover"; announce("LAST CALL · FINAL SCORE", 600); signals.push({ type: "lose" }); } else { state.serveAt = state.tick + 65; announce("BALL DRAINED · NEXT BALL"); } }
      }
      if (state.multiball && state.balls.length === 1 && state.ballSaveUntil <= state.tick) { state.multiball = false; announce("SINGLE BALL · LIGHT THE STARS AGAIN"); }
      return signals;
    },
  };
}

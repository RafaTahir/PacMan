import { describe, expect, it } from "vitest";
import { Buttons, MAX_TICKS, NEUTRAL_INPUT, type ArcadeInput } from "../src/arcade/shared/contracts";
import { BALL_RADIUS, BUMPERS, RAMP_LENGTH, RIVER_LENGTH, TARGETS, createSimulation, rampPoint, riverPoint, sweepRail, type PinballBall } from "../src/arcade/games/midnight-pinball/model";

const input = (buttons = 0, x = 0, y = 0): ArcadeInput => ({ ...NEUTRAL_INPUT, buttons, x, y });
function tableBall(sim: ReturnType<typeof createSimulation>, values: Partial<PinballBall> = {}) {
  const ball = sim.state.balls[0];
  Object.assign(ball, { x: 0, y: 0, px: 0, py: 0, z: BALL_RADIUS, pz: BALL_RADIUS, vx: 0, vy: 0, vz: 0, mode: "table", ...values });
  return ball;
}

describe("MIDNIGHT PINBALL physical play", () => {
  it("serves a stationary steel ball and a charged release propels it up the real shooter lane", () => {
    const sim = createSimulation(51);
    for (let i = 0; i < 20; i++) sim.step(input());
    expect(sim.state.balls[0].y).toBe(6.42);
    for (let i = 0; i < 65; i++) sim.step(input(Buttons.LAUNCH));
    expect(sim.state.plungerCharge).toBeCloseTo(1);
    sim.step(input());
    expect(sim.state.balls[0].mode).toBe("table");
    expect(sim.state.balls[0].vy).toBeLessThan(-25);
    expect(sim.state.ballSaveUntil).toBeGreaterThan(sim.state.tick);
    for (let i = 0; i < 43; i++) sim.step(input());
    expect(sim.state.balls[0].x).toBeLessThan(3.5);
  });

  it("sweeps rounded rails instead of tunnelling through thin segments", () => {
    const hit = sweepRail(-1, 0, 3, 0, { ax: 0, ay: -1, bx: 0, by: 1 }, BALL_RADIUS);
    expect(hit?.t).toBeCloseTo((1 - BALL_RADIUS) / 3);
    expect(hit?.nx).toBe(-1);
    const sim = createSimulation(1), b = tableBall(sim, { x: -4.15, y: -4.6, vx: -30 });
    sim.step(input());
    expect(b.x).toBeGreaterThan(-4.45 + BALL_RADIUS);
    expect(b.vx).toBeGreaterThan(0);
  });

  it("fires flippers with actual angular surface velocity and independently holds each bat", () => {
    const live = createSimulation(1), idle = createSimulation(1);
    const activeBall = tableBall(live, { x: -0.85, y: 5.1 }), idleBall = tableBall(idle, { x: -0.85, y: 5.1 });
    for (let i = 0; i < 4; i++) { live.step(input(Buttons.PRIMARY)); idle.step(input()); }
    expect(activeBall.vy).toBeLessThan(idleBall.vy - 8);
    expect(live.state.flippers[0].angle).toBeCloseTo(-0.43);
    expect(live.state.flippers[1].angle).toBeCloseTo(Math.PI - 0.43);
    for (let i = 0; i < 4; i++) live.step(input(Buttons.SECONDARY));
    expect(live.state.flippers[0].angle).toBeCloseTo(0.43);
    expect(live.state.flippers[1].angle).toBeCloseTo(Math.PI + 0.43);
  });

  it("energizes bumpers and scores each new star contact with bounded contact cooldown", () => {
    const sim = createSimulation(1), bumper = BUMPERS[0];
    const b = tableBall(sim, { x: bumper.x - 1, y: bumper.y, vx: 20 });
    sim.step(input());
    expect(b.vx).toBeLessThan(-10); expect(sim.state.score).toBe(100);
    const score = sim.state.score; sim.step(input()); expect(sim.state.score).toBe(score);
    for (let i = 0; i < 3; i++) {
      const target = TARGETS[i]; Object.assign(b, { x: target.x, y: target.y + 0.6, vx: 0, vy: -15 });
      sim.step(input());
    }
    expect(sim.state.targetBits).toBe(7); expect(sim.state.score).toBe(2600);
    expect(sim.state.message).toContain("LOCK LIT");
  });

  it("captures an earned upward ramp shot, gains real height and returns under gravity", () => {
    const sim = createSimulation(9), b = tableBall(sim, { x: -2.75, y: -0.65, vy: -16 });
    let maximumHeight = 0, elevated = false;
    for (let i = 0; i < 130; i++) { sim.step(input()); maximumHeight = Math.max(maximumHeight, b.z); elevated ||= b.mode === "ramp"; }
    expect(elevated).toBe(true); expect(maximumHeight).toBeGreaterThan(2.05);
    expect(sim.state.rampShots).toBe(1); expect(sim.state.score).toBeGreaterThanOrEqual(1500);
    expect(b.mode).not.toBe("ramp");
    expect(rampPoint(RAMP_LENGTH).z).toBeCloseTo(0.28);
  });

  it("lets an underpowered ball roll back off the ramp instead of awarding an unearned shot", () => {
    const sim = createSimulation(4), b = tableBall(sim, { x: -2.75, y: -0.85, mode: "ramp", rampDistance: 0.1, rampSpeed: 1 });
    for (let i = 0; i < 75; i++) sim.step(input());
    expect(sim.state.rampShots).toBe(0); expect(b.mode).not.toBe("ramp"); expect(b.z).toBe(BALL_RADIUS);
  });

  it("only unlocks three simultaneous balls after a lit bank and completed ramp, then pays jackpot", () => {
    const sim = createSimulation(12); sim.state.targetBits = 7;
    const b = tableBall(sim, { mode: "ramp", rampDistance: RAMP_LENGTH - 0.025, rampSpeed: 12 });
    sim.step(input());
    expect(sim.state.multiball).toBe(true); expect(sim.state.balls).toHaveLength(3); expect(sim.state.targetBits).toBe(0); expect(sim.state.multiplier).toBe(2);
    expect(sim.state.balls.filter(ball => ball.id !== b.id).every(ball => ball.vy < -20)).toBe(true);
    const score = sim.state.score;
    Object.assign(b, { mode: "ramp", rampDistance: RAMP_LENGTH - 0.025, rampSpeed: 12 });
    sim.step(input()); expect(sim.state.jackpots).toBe(1); expect(sim.state.score).toBe(score + 10000);
    expect(sim.state.balls.length).toBeLessThanOrEqual(3);
  });

  it("captures the independent right river orbit and returns a real elevated ball to the left lane", () => {
    const sim = createSimulation(17), b = tableBall(sim, { x: 2.75, y: -0.65, vy: -18 });
    let entered = false, height = 0;
    for (let i = 0; i < 110; i++) { sim.step(input()); entered ||= b.mode === "river"; height = Math.max(height, b.z); }
    expect(entered).toBe(true); expect(height).toBeGreaterThan(1);
    expect(sim.state.riverShots).toBe(1); expect(sim.state.score).toBeGreaterThanOrEqual(900);
    expect(b.mode).not.toBe("river"); expect(riverPoint(RIVER_LENGTH).x).toBeCloseTo(-3.15);
  });

  it("requires both completed routes for island-tour bonus and never pays for a river rollback", () => {
    const sim = createSimulation(17), b = tableBall(sim, { mode: "river", rampDistance: 0.1, rampSpeed: 0.1 });
    for (let i = 0; i < 75 && b.mode === "river"; i++) sim.step(input());
    expect(sim.state.riverShots).toBe(0); expect(sim.state.tourBits).toBe(0); expect(sim.state.score).toBe(0);
    Object.assign(b, { mode: "river", rampDistance: RIVER_LENGTH - 0.02, rampSpeed: 12 }); sim.step(input());
    expect(sim.state.riverShots).toBe(1); expect(sim.state.tourBits).toBe(2); expect(sim.state.tours).toBe(0); expect(sim.state.score).toBe(900);
    Object.assign(b, { mode: "river", rampDistance: RIVER_LENGTH - 0.02, rampSpeed: 12 }); sim.step(input());
    expect(sim.state.tours).toBe(0); expect(sim.state.score).toBe(1800);
    Object.assign(b, { mode: "ramp", rampDistance: RAMP_LENGTH - 0.02, rampSpeed: 12 }); sim.step(input());
    expect(sim.state.tours).toBe(1); expect(sim.state.tourBits).toBe(0); expect(sim.state.multiplier).toBe(2); expect(sim.state.score).toBe(6300);
  });

  it("cannot earn river/tour points by tilting and crossing an otherwise completed route", () => {
    const sim = createSimulation(17); tableBall(sim, { mode: "river", rampDistance: RIVER_LENGTH - 0.02, rampSpeed: 12 });
    sim.state.tilted = true; sim.state.tourBits = 1; sim.step(input());
    expect(sim.state.score).toBe(0); expect(sim.state.tours).toBe(0); expect(sim.state.tourBits).toBe(1);
  });

  it("keeps an elevated ball above playfield bumpers and separates colliding multiballs", () => {
    const sim = createSimulation(1), p = BUMPERS[0];
    const a = tableBall(sim, { x: p.x - 0.3, y: p.y, z: 1.7, mode: "air", vx: 10 });
    sim.step(input()); expect(a.vx).toBeGreaterThan(9); expect(sim.state.score).toBe(0);
    a.mode = "table"; a.z = BALL_RADIUS; a.x = 0; a.y = 1.5; a.vx = 5; a.vy = 0;
    sim.state.balls.push({ ...a, id: 999, x: 0.28, vx: -5 });
    sim.step(input()); expect(a.vx).toBeLessThan(0); expect(sim.state.balls[1].vx).toBeGreaterThan(0);
  });

  it("saves an early drain, consumes exactly three regular balls and starts a fresh run cleanly", () => {
    const sim = createSimulation(32); tableBall(sim, { y: 7.6 }); sim.state.ballSaveUntil = 500;
    sim.step(input()); expect(sim.state.ballsRemaining).toBe(3); expect(sim.state.balls[0].mode).toBe("plunger");
    sim.state.ballSaveUntil = 0;
    for (let i = 0; i < 3; i++) {
      tableBall(sim, { y: 7.6 }); sim.step(input());
      expect(sim.state.ballsRemaining).toBe(2 - i);
      if (i < 2) { for (let n = 0; n < 65; n++) sim.step(input()); expect(sim.state.ballNumber).toBe(i + 2); }
    }
    expect(sim.state.status).toBe("gameover");
    const tick = sim.state.tick; sim.step(input(7)); expect(sim.state.tick).toBe(tick);
    const fresh = createSimulation(32); expect(fresh.state.tick).toBe(0); expect(fresh.state.score).toBe(0); expect(fresh.state.ballsRemaining).toBe(3); expect(fresh.state.targetBits).toBe(0);
  });

  it("does not renew ball-save protection when saved balls are relaunched", () => {
    const sim = createSimulation(20); tableBall(sim, { y: 7.6 }); sim.state.ballSaveUntil = 400;
    sim.step(input());
    for (let i = 0; i < 45; i++) sim.step(input(Buttons.LAUNCH));
    sim.step(input());
    expect(sim.state.balls[0].mode).toBe("table"); expect(sim.state.ballSaveUntil).toBe(400);
  });

  it("limits nudges with a cooldown and accumulated tilt disables flippers and save", () => {
    const sim = createSimulation(4), b = tableBall(sim, { x: 3.95, y: 3 }); sim.state.ballSaveUntil = 600;
    sim.step(input(0, 127, 0)); const velocity = b.vx;
    sim.step(input(0, 127, 0)); expect(b.vx).toBeLessThanOrEqual(velocity);
    for (let i = 0; i < 3; i++) { sim.state.nudgeCooldown = 0; sim.step(input(Buttons.PRIMARY, 127, 0)); }
    expect(sim.state.tilted).toBe(true); expect(sim.state.ballSaveUntil).toBe(0);
    for (let i = 0; i < 6; i++) sim.step(input(Buttons.PRIMARY | Buttons.SECONDARY));
    expect(sim.state.flippers[0].angle).toBeCloseTo(0.43); expect(sim.state.flippers[1].angle).toBeCloseTo(Math.PI - 0.43);
  });

  it("has a strict 7,200 tick ceiling even when a player waits on the plunger", () => {
    const sim = createSimulation(123);
    for (let i = 0; i < MAX_TICKS + 30; i++) sim.step(input());
    expect(sim.state.tick).toBe(MAX_TICKS); expect(sim.state.status).toBe("gameover"); expect(sim.state.score).toBe(0);
  });

  it("replays all 7,200 deterministic input frames with finite bounded physical state", () => {
    const a = createSimulation(0xcafe), b = createSimulation(0xcafe);
    for (let tick = 0; tick < MAX_TICKS; tick++) {
      const frame = input((tick % 300 < 40 ? Buttons.LAUNCH : 0) | (tick % 37 < 11 ? Buttons.PRIMARY : 0) | (tick % 43 < 13 ? Buttons.SECONDARY : 0), tick % 257 === 0 ? -127 : 0, 0);
      expect(a.step(frame)).toEqual(b.step(frame));
      if (tick % 120 === 0) expect(a.state).toEqual(b.state);
      for (const ball of a.state.balls) expect([ball.x, ball.y, ball.z, ball.vx, ball.vy].every(Number.isFinite)).toBe(true);
      expect(a.state.balls.length).toBeLessThanOrEqual(3);
    }
    expect(a.state).toEqual(b.state);
  });

  it("earns the complete star-bank/ramp/multiball/jackpot loop using only timed player controls", () => {
    const sim = createSimulation(1); let launchFrames = 0, sawMultiball = false;
    for (let tick = 0; tick < MAX_TICKS && sim.state.status === "playing"; tick++) {
      let buttons = 0;
      if (sim.state.balls.some(b => b.mode === "plunger")) { launchFrames++; if (launchFrames % 51 < 50) buttons |= Buttons.LAUNCH; } else launchFrames = 0;
      for (const b of sim.state.balls) if (b.y > 4.2 && b.y < 5.5 && b.vy > 0) { if (b.x < 0.2) buttons |= Buttons.PRIMARY; if (b.x > -0.2) buttons |= Buttons.SECONDARY; }
      sim.step(input(buttons)); sawMultiball ||= sim.state.multiball;
    }
    expect(sawMultiball).toBe(true); expect(sim.state.rampShots).toBeGreaterThanOrEqual(3); expect(sim.state.jackpots).toBeGreaterThanOrEqual(1);
    expect(sim.state.multiplier).toBeGreaterThan(1); expect(sim.state.score).toBeGreaterThan(10000);
  });
});

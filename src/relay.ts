/** Original Circuit Relay mode. Pure state uses the engine clock, never wall time. */
export const RELAY_BEACONS = [{x:6,y:5},{x:21,y:5},{x:21,y:23},{x:6,y:23}] as const;
export interface RelayState {
  target: number; collected: number; circuits: number; deadline: number;
  streak: number; lastDot: number; ward: boolean; graceUntil: number;
  message: string; messageUntil: number;
}
export function createRelay(seed: number): RelayState {
  return { target: seed % 4, collected: 0, circuits: 0, deadline: 0, streak: 0,
    lastDot: -1000, ward: false, graceUntil: 0, message: "FOLLOW THE NUMBERED BEACON", messageUntil: 240 };
}
export function advanceRelay(r: RelayState, x: number, y: number, dot: boolean, frame: number): number {
  let points = 0;
  if (frame - r.lastDot > 150) r.streak = 0;
  if (r.deadline && frame > r.deadline) {
    r.collected = 0; r.deadline = 0;
    r.message = "RELAY EXPIRED · TRY AGAIN"; r.messageUntil = frame + 150;
  }
  if (dot) {
    r.lastDot = frame; r.streak++;
    if (r.streak % 20 === 0) {
      points += 100 * Math.min(4, r.streak / 20);
      r.message = `DOT FLOW ${r.streak} · +${points}`; r.messageUntil = frame + 100;
    }
  }
  const target = RELAY_BEACONS[r.target];
  if (x === target.x && y === target.y) {
    r.collected++; r.target = (r.target + 1) % 4; r.deadline = frame + 900;
    points += 150 * r.collected;
    r.message = `RELAY ${r.collected}/4 · +${150 * r.collected}`; r.messageUntil = frame + 150;
    if (r.collected === 4) {
      r.circuits++; r.collected = 0; r.deadline = 0; r.ward = true;
      points += 600; r.message = "CIRCUIT COMPLETE · WARD READY";
    }
  }
  return points;
}

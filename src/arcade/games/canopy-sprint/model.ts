import { Buttons, DT, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from '../../shared/contracts';
import { clamp, seededRandom } from '../../shared/math';
export const LANES = [-2.2, 0, 2.2] as const;
export type TrailKind = 'log' | 'gate' | 'crate' | 'gap' | 'orchid';
export interface TrailObject { id: number; lane: number; distance: number; previousDistance: number; kind: TrailKind; resolved: boolean }
export interface CanopyState extends ArcadeState {
  lane: number; x: number; previousX: number; height: number; previousHeight: number; verticalSpeed: number;
  slideTicks: number; slideCooldown: number; invincible: number; hearts: number; distance: number; speed: number;
  chain: number; bestChain: number; orchids: number; obstaclesCleared: number; nearMisses: number;
  objects: TrailObject[]; hitTick: number; message: string; messageUntil: number;
}
/** Fixed-step trail runner; presentation never advances this model or RNG. */
export function createSimulation(seed: number): ArcadeSimulation<CanopyState> {
 const random = seededRandom(seed);
 const state: CanopyState = { seed, tick: 0, score: 0, status: 'playing', lane: 1, x: 0, previousX: 0,
  height: 0, previousHeight: 0, verticalSpeed: 0, slideTicks: 0, slideCooldown: 0, invincible: 0, hearts: 3,
  distance: 0, speed: 11, chain: 0, bestChain: 0, orchids: 0, obstaclesCleared: 0, nearMisses: 0,
  objects: [], hitTick: -100, message: 'FOLLOW THE ORCHIDS · WATCH THE TRAIL', messageUntil: 180 };
 let nextId = 0, spawnTick = 55, wave = 0, lastButtons = 0, lastSteer = 0, steerRepeat = 0;
 const add = (lane: number, kind: TrailKind, distance: number) => state.objects.push({ id: nextId++, lane, kind, distance, previousDistance: distance, resolved: false });
 const award = (points: number, signals: GameSignal[]) => { state.score += points; signals.push({ type: 'score', value: points }); };
 const multiplier = () => 1 + Math.min(4, Math.floor(state.chain / 5));
 return { state, step(input: Readonly<ArcadeInput>) {
  if (state.status !== 'playing') return [];
  const signals: GameSignal[] = [];
  state.tick++; state.previousX = state.x; state.previousHeight = state.height;
  state.invincible = Math.max(0, state.invincible - 1);
  state.slideTicks = Math.max(0, state.slideTicks - 1); state.slideCooldown = Math.max(0, state.slideCooldown - 1);
  const steer = input.x > 42 ? 1 : input.x < -42 ? -1 : 0;
  if (steer && (steer !== lastSteer || steerRepeat <= 0)) { state.lane = clamp(state.lane + steer, 0, 2); steerRepeat = 15; }
  steerRepeat--; lastSteer = steer;
  const presses = input.buttons & ~lastButtons; lastButtons = input.buttons;
  if ((presses & Buttons.PRIMARY) && state.height <= 0 && state.slideTicks === 0) { state.verticalSpeed = 8.4; signals.push({ type: 'boost' }); }
  if ((presses & Buttons.SECONDARY) && state.height <= 0 && state.slideCooldown === 0) { state.slideTicks = 42; state.slideCooldown = 58; signals.push({ type: 'dash' }); }
  state.x += clamp(LANES[state.lane] - state.x, -0.3, 0.3);
  if (state.verticalSpeed !== 0 || state.height > 0) {
   state.height += state.verticalSpeed * DT; state.verticalSpeed -= 21 * DT;
   if (state.height <= 0) { state.height = 0; state.verticalSpeed = 0; }
  }
  state.speed = 11 + 8 * state.tick / MAX_TICKS;
  const advance = state.speed * DT; state.distance += advance;
  if (state.tick % 6 === 0) state.score += 1;
  if (state.tick >= spawnTick) {
   const safe = Math.floor(random() * 3), danger = (safe + 1 + Math.floor(random() * 2)) % 3;
   const kinds: TrailKind[] = wave < 3 ? ['log', 'gate', 'crate'] : ['log', 'gate', 'crate', 'gap'];
   add(danger, kinds[wave < 3 ? wave : Math.floor(random() * kinds.length)], 40);
   if (wave > 4 && wave % 3 === 0) add((danger + 1) % 3, random() < 0.5 ? 'log' : 'gate', 40);
   let rewardLane = safe;
   if (wave > 4 && wave % 3 === 0 && rewardLane === (danger + 1) % 3) rewardLane = (danger + 2) % 3;
   for (let i = 0; i < 3; i++) add(rewardLane, 'orchid', 42 + i * 1.65);
   wave++; spawnTick += Math.round(79 - 22 * state.tick / MAX_TICKS);
  }
  for (const object of state.objects) {
   object.previousDistance = object.distance; object.distance -= advance;
   if (object.resolved || object.distance > 0.55) continue;
   object.resolved = true;
   const separation = Math.abs(state.x - LANES[object.lane]);
   if (object.kind === 'orchid') {
    if (separation < 0.9 && state.height < 1.75) {
     state.orchids++; state.chain++; state.bestChain = Math.max(state.bestChain, state.chain); award(25 * multiplier(), signals);
     if (state.chain % 5 === 0) { signals.push({ type: 'chain', value: state.chain }); state.message = `ORCHID CHAIN ×${multiplier()}`; state.messageUntil = state.tick + 75; }
    }
    continue;
   }
   const onRoute = separation < 0.95;
   const cleared = !onRoute || (object.kind === 'log' || object.kind === 'gap') && state.height > 0.72 || object.kind === 'gate' && state.slideTicks > 0;
   if (!cleared && state.invincible === 0) {
    state.hearts--; state.chain = 0; state.invincible = 100; state.hitTick = state.tick;
    state.message = object.kind === 'gate' ? 'SLIDE UNDER THE ARCHES' : object.kind === 'crate' ? 'SWITCH LANES AROUND CRATES' : 'JUMP THE LOGS AND GAPS'; state.messageUntil = state.tick + 120;
    signals.push({ type: 'hit' });
    if (state.hearts === 0) { state.status = 'gameover'; signals.push({ type: 'lose' }); }
   } else if (cleared) {
    state.obstaclesCleared++;
    if (onRoute) { award(80 * multiplier(), signals); state.message = object.kind === 'gate' ? 'CLEAN SLIDE!' : 'CLEAN JUMP!'; state.messageUntil = state.tick + 55; }
    else if (separation < 2.5) { state.nearMisses++; award(15, signals); signals.push({ type: 'near-miss' }); }
   }
  }
  state.objects = state.objects.filter(object => object.distance > -5);
  if (state.tick >= MAX_TICKS && state.status === 'playing') {
   state.status = 'victory'; award(500 + state.hearts * 250 + state.bestChain * 10, signals); signals.push({ type: 'win' });
  }
  return signals;
 } };
}

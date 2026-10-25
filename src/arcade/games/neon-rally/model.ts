import { Buttons, DT, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from "../../shared/contracts";
import { axis, clamp } from "../../shared/math";

/** All distances are metres; the player remains at longitudinal distance zero. */
export const ROAD_HALF_WIDTH = 7.6;
export const PLAYER_HALF_WIDTH = 0.78;
export const PLAYER_HALF_LENGTH = 1.6;
export const LANES = [-5.4, -1.8, 1.8, 5.4] as const;
export const MAX_ENTITIES = 44;
export const MAX_EFFECTS = 36;
export const MAX_SCORE = 999_999;
export const DISTRICT_NAMES = ["LOWER GRID", "GLASS QUARTER", "AFTERLIGHT", "FINAL BRIDGE"] as const;

export type EntityKind = "sedan" | "taxi" | "van" | "truck" | "bike" | "barrier" | "cone" | "oil" | "cell";
export type EffectKind = "spark" | "drift" | "boost" | "near" | "repair" | "checkpoint";
export type RallyCallout = "NEAR MISS" | "DANGEROUS" | "DRIFT BANKED" | "NITRO" | "REPAIRED" | "CHECKPOINT" | "CAR LOST" | "OIL SLICK" | "FINISH";

export interface RallyEntity {
  id: number;
  kind: EntityKind;
  x: number;
  previousX: number;
  baseX: number;
  distance: number;
  previousDistance: number;
  speed: number;
  width: number;
  length: number;
  color: number;
  sway: number;
  phase: number;
  hit: boolean;
  scored: boolean;
  /** Smallest edge-to-edge clearance while the two vehicles overlap in depth. */
  nearGap: number;
}

export interface RallyEffect {
  id: number;
  kind: EffectKind;
  x: number;
  distance: number;
  life: number;
  duration: number;
}

export interface RallyPlayer {
  x: number;
  previousX: number;
  velocityX: number;
  heading: number;
  speed: number;
  health: number;
  nitro: number;
  boostLocked: boolean;
  boosting: boolean;
  drifting: boolean;
  driftCharge: number;
  invulnerable: number;
  oilTicks: number;
  edgeCooldown: number;
}

export interface RallyState extends ArcadeState {
  rng: number;
  player: RallyPlayer;
  lives: number;
  distance: number;
  previousDistance: number;
  district: number;
  combo: number;
  comboTicks: number;
  bestCombo: number;
  nearMisses: number;
  overtakes: number;
  collisions: number;
  driftScore: number;
  entities: RallyEntity[];
  effects: RallyEffect[];
  nextId: number;
  spawnCooldown: number;
  hazardCooldown: number;
  cellCooldown: number;
  safeLane: number;
  scoreRemainder: number;
  callout: { label: RallyCallout; value: number; ticks: number } | null;
}

const VEHICLE_COLORS = [0x16d6cf, 0xe04f98, 0x9366f3, 0x2871db, 0xb9c9dc, 0xe45b48];
const VEHICLES: readonly EntityKind[] = ["sedan", "sedan", "taxi", "van", "truck", "bike"];
const DIMENSIONS: Record<EntityKind, readonly [number, number]> = {
  sedan: [1.68, 3.7], taxi: [1.7, 3.9], van: [1.9, 4.4], truck: [2.12, 6.2],
  bike: [0.86, 2.1], barrier: [2.5, 1.05], cone: [0.7, 0.7], oil: [2.8, 3.2], cell: [1.1, 1.1],
};

function random(state: RallyState): number {
  let value = state.rng;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng / 0x1_0000_0000;
}

/** Exported for transparent replay fixtures and collision/dimension inspection. */
export function makeEntity(id: number, kind: EntityKind, x: number, distance: number, speed = 0): RallyEntity {
  const [width, length] = DIMENSIONS[kind];
  return { id, kind, x, previousX: x, baseX: x, distance, previousDistance: distance, speed, width, length,
    color: 0x16d6cf, sway: 0, phase: 0, hit: false, scored: false, nearGap: 100 };
}

export const comboMultiplier = (combo: number): number => Math.min(8, 1 + Math.floor(combo / 3));
export const isTraffic = (kind: EntityKind): boolean => kind === "sedan" || kind === "taxi" || kind === "van" || kind === "truck" || kind === "bike";

export class RallySimulation implements ArcadeSimulation<RallyState> {
  readonly state: RallyState;

  constructor(seed: number) {
    this.state = {
      seed: seed >>> 0, rng: seed >>> 0 || 1, tick: 0, score: 0, status: "playing",
      player: { x: 0, previousX: 0, velocityX: 0, heading: 0, speed: 26, health: 100, nitro: 65,
        boostLocked: false, boosting: false, drifting: false, driftCharge: 0, invulnerable: 0, oilTicks: 0, edgeCooldown: 0 },
      lives: 3, distance: 0, previousDistance: 0, district: 0, combo: 0, comboTicks: 0, bestCombo: 0,
      nearMisses: 0, overtakes: 0, collisions: 0, driftScore: 0, entities: [], effects: [], nextId: 1,
      spawnCooldown: 85, hazardCooldown: 380, cellCooldown: 590, safeLane: 2, scoreRemainder: 0, callout: null,
    };
    // A readable first overtake and a clear starting lane, before dense traffic arrives.
    this.spawnVehicle(0, 23, "taxi");
    this.spawnVehicle(2, 43, "sedan");
    this.spawnVehicle(3, 62, "van");
  }

  step(input: Readonly<ArcadeInput>): readonly GameSignal[] {
    const state = this.state;
    if (state.status !== "playing") return [];
    const signals: GameSignal[] = [];
    state.tick++;
    state.previousDistance = state.distance;
    if (state.callout && --state.callout.ticks <= 0) state.callout = null;
    if (state.comboTicks > 0) {
      state.comboTicks = Math.max(0, state.comboTicks - 1);
      if (state.comboTicks === 0) state.combo = 0;
    }
    for (const effect of state.effects) {
      effect.life--;
      effect.distance -= state.player.speed * DT * 0.7;
    }
    state.effects = state.effects.filter((effect) => effect.life > 0);

    this.movePlayer(input, signals);
    if (state.status !== "playing") return signals;
    state.distance += state.player.speed * DT;
    state.scoreRemainder += state.player.speed * DT * 1.6;
    const distanceScore = Math.floor(state.scoreRemainder);
    state.scoreRemainder -= distanceScore;
    this.addScore(distanceScore);

    for (const entity of state.entities) {
      entity.previousDistance = entity.distance;
      entity.previousX = entity.x;
      entity.distance -= (state.player.speed - entity.speed) * DT;
      // Triangle-wave lane movement uses only integer/reproducible arithmetic.
      const phase = ((state.tick + entity.phase) % 480) / 240;
      entity.x = entity.baseX + (1 - 2 * Math.abs(phase - 1)) * entity.sway;
      const longitudinalOverlap = Math.abs(entity.distance) < PLAYER_HALF_LENGTH + entity.length / 2;
      const gap = Math.abs(entity.x - state.player.x) - PLAYER_HALF_WIDTH - entity.width / 2;
      if (longitudinalOverlap) {
        entity.nearGap = Math.min(entity.nearGap, gap);
        if (gap < 0 && !entity.hit) this.collide(entity, signals);
      }
      if (state.status !== "playing") break;
      if (!entity.scored && entity.distance < -PLAYER_HALF_LENGTH - entity.length / 2 - 0.2) {
        entity.scored = true;
        if (isTraffic(entity.kind) && !entity.hit) {
          state.overtakes++;
          this.addScore(25);
          if (entity.nearGap >= 0 && entity.nearGap < 0.95) this.nearMiss(entity.nearGap, signals);
        }
      }
    }
    state.entities = state.entities.filter((entity) => entity.distance > -13);

    if (state.status !== "playing") return signals;
    const district = Math.min(3, Math.floor(state.tick / 1800));
    if (district > state.district) {
      state.district = district;
      state.player.health = Math.min(100, state.player.health + 18);
      state.player.nitro = Math.min(100, state.player.nitro + 22);
      this.addScore(500 * district);
      this.announce("CHECKPOINT", 500 * district, 150);
      this.effect("checkpoint", state.player.x, 0, 75);
      signals.push({ type: "upgrade", value: district });
    }

    if (--state.spawnCooldown <= 0) this.spawnWave();
    if (--state.hazardCooldown <= 0) this.spawnHazard();
    if (--state.cellCooldown <= 0) {
      this.spawnEntity("cell", LANES[state.safeLane], 64);
      state.cellCooldown = 540 + Math.floor(random(state) * 180);
    }

    if (state.tick >= MAX_TICKS) {
      state.status = "victory";
      state.player.boosting = false;
      state.player.drifting = false;
      const finishBonus = 1_000 + state.lives * 300 + state.player.health * 15;
      this.addScore(finishBonus);
      this.announce("FINISH", finishBonus, 300);
      signals.push({ type: "win", value: state.score });
    }
    return signals;
  }

  private movePlayer(input: Readonly<ArcadeInput>, signals: GameSignal[]): void {
    const state = this.state;
    const player = state.player;
    player.previousX = player.x;
    player.invulnerable = Math.max(0, player.invulnerable - 1);
    player.edgeCooldown = Math.max(0, player.edgeCooldown - 1);
    player.oilTicks = Math.max(0, player.oilTicks - 1);
    const steer = axis(input.x) / 127;
    const throttle = axis(input.y) / 127;
    const brake = (input.buttons & Buttons.SECONDARY) !== 0;
    const wantsBoost = (input.buttons & Buttons.PRIMARY) !== 0 && !brake;
    if (!wantsBoost || player.nitro >= 20) player.boostLocked = false;
    const wasBoosting = player.boosting;
    player.boosting = wantsBoost && !player.boostLocked && player.nitro > 0 && player.oilTicks === 0;
    if (player.boosting) {
      player.nitro = Math.max(0, player.nitro - 27 * DT);
      if (player.nitro === 0) player.boostLocked = true;
      if (!wasBoosting) {
        signals.push({ type: "boost" });
        this.announce("NITRO", 0, 40);
      }
      if (state.tick % 5 === 0) this.effect("boost", player.x, -1.7, 22);
    } else {
      player.nitro = Math.min(100, player.nitro + 3.8 * DT);
    }

    const previouslyDrifting = player.drifting;
    player.drifting = brake && player.speed > 15;
    let targetSpeed = 33 + Math.min(6, state.tick / 1200) - throttle * (throttle > 0 ? 12 : 4);
    if (brake) targetSpeed -= 10;
    if (player.boosting) targetSpeed += 13;
    if (player.oilTicks > 0) targetSpeed -= 5;
    player.speed += (targetSpeed - player.speed) * (targetSpeed > player.speed ? 0.023 : 0.045);
    player.speed = clamp(player.speed, 9, 55);

    const onOil = player.oilTicks > 0;
    const acceleration = onOil ? 14 : player.drifting ? 29 : 32;
    const friction = onOil ? 1.1 : player.drifting ? 2.6 : 6.4;
    player.velocityX = (player.velocityX + steer * acceleration * DT) / (1 + friction * DT);
    player.velocityX = clamp(player.velocityX, -10.5, 10.5);
    player.x += player.velocityX * DT;
    const targetHeading = steer * (player.drifting ? 0.36 : 0.12) + player.velocityX * 0.035;
    player.heading += (targetHeading - player.heading) * 0.16;

    const edge = ROAD_HALF_WIDTH - PLAYER_HALF_WIDTH - 0.12;
    if (Math.abs(player.x) > edge) {
      player.x = clamp(player.x, -edge, edge);
      player.velocityX *= -0.36;
      if (player.edgeCooldown === 0) {
        player.edgeCooldown = 42;
        this.damage(9, signals, false);
        this.effect("spark", player.x, 0, 28);
      }
    }

    if (player.drifting && Math.abs(player.velocityX) > 2 && player.oilTicks === 0) {
      player.driftCharge = Math.min(4, player.driftCharge + DT * Math.min(2, Math.abs(player.velocityX) / 4));
      // A controlled drift can keep a close-pass chain alive, for a bounded time.
      if (state.comboTicks > 0) state.comboTicks = Math.min(300, state.comboTicks + 0.45);
      if (state.tick % 7 === 0) this.effect("drift", player.x, -0.6, 42);
    }
    if (previouslyDrifting && !player.drifting) {
      if (player.driftCharge >= 0.6) {
        const points = Math.round(player.driftCharge * 100) * comboMultiplier(state.combo);
        this.addScore(points);
        state.driftScore += points;
        player.nitro = Math.min(100, player.nitro + player.driftCharge * 7);
        this.announce("DRIFT BANKED", points, 85);
        signals.push({ type: "score", value: points });
      }
      player.driftCharge = 0;
    }
  }

  private collide(entity: RallyEntity, signals: GameSignal[]): void {
    const state = this.state;
    const player = state.player;
    entity.hit = true;
    if (entity.kind === "cell") {
      player.health = Math.min(100, player.health + 22);
      player.nitro = Math.min(100, player.nitro + 35);
      entity.distance = -20;
      this.addScore(100);
      this.effect("repair", player.x, 0, 42);
      this.announce("REPAIRED", 100, 90);
      signals.push({ type: "upgrade", value: 22 });
      return;
    }
    if (player.invulnerable > 0) return;
    if (entity.kind === "oil") {
      player.oilTicks = 110;
      player.velocityX += (entity.x <= player.x ? 1 : -1) * 3.2;
      player.speed *= 0.86;
      player.driftCharge = 0;
      state.combo = 0;
      state.comboTicks = 0;
      this.announce("OIL SLICK", 0, 90);
      this.effect("drift", player.x, 0, 45);
      signals.push({ type: "hit", value: 0 });
      return;
    }
    const damage = entity.kind === "truck" ? 46 : entity.kind === "barrier" ? 39 : entity.kind === "cone" ? 12 : entity.kind === "bike" ? 24 : 32;
    player.velocityX += (entity.x <= player.x ? 1 : -1) * 3.5;
    this.damage(damage + (player.boosting ? 8 : 0), signals, true);
    this.effect("spark", (player.x + entity.x) * 0.5, 0, 38);
  }

  private damage(amount: number, signals: GameSignal[], trafficHit: boolean): void {
    const state = this.state;
    const player = state.player;
    if (player.invulnerable > 0) return;
    player.health = Math.max(0, player.health - amount);
    player.speed *= trafficHit ? 0.66 : 0.94;
    player.invulnerable = trafficHit ? 78 : 22;
    player.driftCharge = 0;
    player.boosting = false;
    state.combo = 0;
    state.comboTicks = 0;
    state.collisions++;
    signals.push({ type: "hit", value: amount });
    if (player.health === 0) {
      state.lives--;
      signals.push({ type: "death", value: state.lives });
      if (state.lives > 0) {
        player.health = 100;
        player.invulnerable = 180;
        player.oilTicks = 0;
        player.velocityX *= 0.3;
        player.nitro = Math.max(35, player.nitro);
        this.announce("CAR LOST", state.lives, 135);
        // Recovery never respawns the player inside another vehicle.
        for (const entity of state.entities) if (Math.abs(entity.distance) < 8) entity.hit = true;
      } else {
        state.status = "gameover";
        player.boosting = false;
        player.drifting = false;
        signals.push({ type: "lose", value: state.score });
      }
    }
  }

  private nearMiss(gap: number, signals: GameSignal[]): void {
    const state = this.state;
    const player = state.player;
    state.combo = Math.min(30, state.combo + 1);
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.comboTicks = 300;
    state.nearMisses++;
    const dangerous = gap < 0.25;
    const base = dangerous ? 230 : 140;
    const points = (base + (player.boosting ? 100 : 0) + (player.drifting ? 60 : 0)) * comboMultiplier(state.combo);
    this.addScore(points);
    player.nitro = Math.min(100, player.nitro + (dangerous ? 17 : 11));
    this.announce(dangerous ? "DANGEROUS" : "NEAR MISS", points, 75);
    this.effect("near", player.x, 0, 38);
    signals.push({ type: "near-miss", value: points });
    if (state.combo % 3 === 0) signals.push({ type: "chain", value: comboMultiplier(state.combo) });
  }

  private spawnWave(): void {
    const state = this.state;
    // The empty lane moves one lane at a time so every wave has a reachable opening.
    const direction = random(state) > 0.5 ? 1 : -1;
    state.safeLane = clamp(state.safeLane + direction, 0, 3);
    const count = state.district === 0 ? (random(state) < 0.6 ? 1 : 2) : state.district === 1 ? 2 : random(state) < 0.65 ? 2 : 3;
    const candidates = [0, 1, 2, 3].filter((lane) => lane !== state.safeLane);
    for (let index = candidates.length - 1; index > 0; index--) {
      const other = Math.floor(random(state) * (index + 1));
      [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
    }
    for (let index = 0; index < count; index++) this.spawnVehicle(candidates[index], 62 + index * 3);
    state.spawnCooldown = 94 - state.district * 11 + Math.floor(random(state) * 32);
  }

  private spawnVehicle(lane: number, distance: number, forcedKind?: EntityKind): void {
    const state = this.state;
    const kind = forcedKind ?? VEHICLES[Math.floor(random(state) * VEHICLES.length)];
    const entity = this.spawnEntity(kind, LANES[lane] + (random(state) - 0.5) * 0.45, distance, 12 + random(state) * 9);
    if (entity) {
      entity.color = kind === "taxi" ? 0xffc857 : VEHICLE_COLORS[Math.floor(random(state) * VEHICLE_COLORS.length)];
      entity.sway = kind === "bike" ? 0.68 : 0.12 + random(state) * 0.26;
      entity.phase = Math.floor(random(state) * 480);
    }
  }

  private spawnHazard(): void {
    const state = this.state;
    const lane = (state.safeLane + 1 + Math.floor(random(state) * 3)) % 4;
    const kind: EntityKind = state.district > 0 && random(state) < 0.38 ? "oil" : "barrier";
    this.spawnEntity(kind, LANES[lane], 65);
    if (kind === "barrier") {
      this.spawnEntity("cone", LANES[lane] - 1.35, 61);
      this.spawnEntity("cone", LANES[lane] + 1.35, 69);
    }
    state.hazardCooldown = 310 - state.district * 35 + Math.floor(random(state) * 110);
  }

  private spawnEntity(kind: EntityKind, x: number, distance: number, speed = 0): RallyEntity | null {
    const state = this.state;
    if (state.entities.length >= MAX_ENTITIES) return null;
    const entity = makeEntity(state.nextId++, kind, x, distance, speed);
    state.entities.push(entity);
    return entity;
  }

  private effect(kind: EffectKind, x: number, distance: number, duration: number): void {
    const state = this.state;
    if (state.effects.length >= MAX_EFFECTS) state.effects.shift();
    state.effects.push({ id: state.nextId++, kind, x, distance, life: duration, duration });
  }

  private announce(label: RallyCallout, value: number, ticks: number): void {
    this.state.callout = { label, value, ticks };
  }

  private addScore(points: number): void {
    this.state.score = Math.min(MAX_SCORE, this.state.score + Math.max(0, Math.floor(points)));
  }
}

export function createSimulation(seed: number): RallySimulation {
  return new RallySimulation(seed);
}

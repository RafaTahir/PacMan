import type {
  Actor,
  Direction,
  GameEvent,
  GameState,
  Ghost,
  GhostId,
  Pacman,
  Phase,
} from "./types";
import { COLS, initialPellets, isWalkable, key } from "./maze";
import {
  BASE_SPEED,
  fruitForLevel,
  getLevelConfig,
  scatterSchedule,
  TICK_RATE,
  TICK_SECONDS,
} from "./levels";

export const DIRECTIONS: readonly Direction[] = ["up", "left", "down", "right"];
export const VECTORS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  right: { x: 1, y: 0 },
};
export const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  left: "right",
  down: "up",
  right: "left",
};
const CORNERS: Record<GhostId, { x: number; y: number }> = {
  blinky: { x: 25, y: -3 },
  pinky: { x: 2, y: -3 },
  inky: { x: 27, y: 31 },
  clyde: { x: 0, y: 31 },
};
const RELEASE_ORDER: GhostId[] = ["pinky", "inky", "clyde"];
const HOME_X: Record<GhostId, number> = {
  blinky: 13.5,
  pinky: 13.5,
  inky: 11.5,
  clyde: 15.5,
};
const EPSILON = 1e-7;
type Point = { x: number; y: number };
type HouseRoute = { points: Point[]; kind: "enter" | "exit" };

const tileCoordinate = (value: number): number => Math.floor(value + 0.5);
const wrappedX = (value: number): number => ((value % COLS) + COLS) % COLS;
const distanceSquared = (a: Point, b: Point): number =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const actorTile = (actor: Actor): Point => ({
  x: wrappedX(tileCoordinate(actor.x)),
  y: tileCoordinate(actor.y),
});

/** Original target rules, including the overflow in the upward look-ahead. */
export function ghostTarget(
  id: GhostId,
  pacman: Pick<Pacman, "x" | "y" | "dir">,
  blinky: Pick<Ghost, "x" | "y">,
  mode: "scatter" | "chase",
  elroy = false,
  ghostPosition: Point = CORNERS.clyde,
): Point {
  if (mode === "scatter" && !(id === "blinky" && elroy))
    return { ...CORNERS[id] };
  const pac = { x: tileCoordinate(pacman.x), y: tileCoordinate(pacman.y) };
  const vector = VECTORS[pacman.dir];
  if (id === "blinky") return pac;
  if (id === "pinky")
    return {
      x: pac.x + vector.x * 4 - (pacman.dir === "up" ? 4 : 0),
      y: pac.y + vector.y * 4,
    };
  if (id === "inky") {
    const ahead = {
      x: pac.x + vector.x * 2 - (pacman.dir === "up" ? 2 : 0),
      y: pac.y + vector.y * 2,
    };
    return {
      x: ahead.x * 2 - tileCoordinate(blinky.x),
      y: ahead.y * 2 - tileCoordinate(blinky.y),
    };
  }
  return distanceSquared(ghostPosition, pac) >= 64 ? pac : { ...CORNERS.clyde };
}

/** Choose at a tile center. Strict comparison preserves up/left/down/right ties. */
export function chooseGhostDirection(
  ghost: Pick<Ghost, "x" | "y" | "dir" | "mode">,
  target: Point,
  frightened = ghost.mode === "frightened",
  random: () => number = Math.random,
): Direction {
  const x = tileCoordinate(ghost.x),
    y = tileCoordinate(ghost.y);
  const forbiddenUp =
    !frightened &&
    ghost.mode !== "eyes" &&
    (x === 12 || x === 15) &&
    (y === 11 || y === 23);
  let choices = DIRECTIONS.filter((dir) => {
    const v = VECTORS[dir];
    return (
      dir !== OPPOSITE[ghost.dir] &&
      !(dir === "up" && forbiddenUp) &&
      isWalkable(x + v.x, y + v.y, ghost.mode)
    );
  });
  if (!choices.length)
    choices = DIRECTIONS.filter((dir) => {
      const v = VECTORS[dir];
      return isWalkable(x + v.x, y + v.y, ghost.mode);
    });
  if (!choices.length) return ghost.dir;
  if (frightened) {
    const clockwise: readonly Direction[] = ["up", "right", "down", "left"];
    const first = Math.min(3, Math.floor(random() * 4));
    for (let offset = 0; offset < 4; offset++) {
      const direction = clockwise[(first + offset) % 4];
      if (choices.includes(direction)) return direction;
    }
  }
  let chosen = choices[0],
    best = Infinity;
  for (const dir of choices) {
    const v = VECTORS[dir];
    const distance = distanceSquared({ x: x + v.x, y: y + v.y }, target);
    if (distance < best) {
      best = distance;
      chosen = dir;
    }
  }
  return chosen;
}

function makePacman(): Pacman {
  return { x: 13.5, y: 23, dir: "left", nextDir: "left", moving: true };
}

function makeGhosts(): Ghost[] {
  return (["blinky", "pinky", "inky", "clyde"] as GhostId[]).map((id) => ({
    id,
    x: HOME_X[id],
    y: id === "blinky" ? 11 : 14,
    dir: id === "blinky" ? "left" : id === "inky" ? "up" : "down",
    mode: id === "blinky" ? "normal" : "house",
    frightenedVisual: false,
    moving: true,
    target: { ...CORNERS[id] },
  }));
}

/** Deterministic simulation. Rendering and input events never advance its clock. */
export class Game {
  public state: GameState;
  private accumulator = 0;
  private events: GameEvent[] = [];
  private readonly initialSeed: number;
  private randomState: number;
  private motions = new Map<Actor, Point>();
  private routes = new Map<GhostId, HouseRoute>();
  private reversePending = new Set<GhostId>();
  private nextGhostDirections = new Map<GhostId, Direction>();
  private exitRight = new Set<GhostId>();
  private revived = new Set<GhostId>();
  private personalCounters: Record<GhostId, number> = {
    blinky: 0,
    pinky: 0,
    inky: 0,
    clyde: 0,
  };
  private globalCounterActive = false;
  private globalCounter = 0;
  private releaseIdleTicks = 0;
  private elroyEnabled = true;
  private modeIndex = 0;
  private modeTicks = 0;
  private frightenedTicks = 0;
  private pelletPause = 0;
  private scorePause = 0;
  private extraLifeAwarded = false;
  private readyDuration = 2;

  constructor(options: { highScore?: number; seed?: number } = {}) {
    this.initialSeed = (options.seed ?? 0x19801980) >>> 0 || 1;
    this.randomState = this.initialSeed;
    this.state = this.freshState(Math.max(0, options.highScore ?? 0));
    this.resetActors(false);
  }

  private freshState(highScore: number): GameState {
    return {
      phase: "title",
      paused: false,
      score: 0,
      highScore,
      level: 1,
      lives: 3,
      time: 0,
      phaseTime: 0,
      frame: 0,
      ...initialPellets(),
      pacman: makePacman(),
      ghosts: makeGhosts(),
      fruit: null,
      fruitHistory: ["cherry"],
      frightenedRemaining: 0,
      frightChain: 0,
      mode: "scatter",
      popups: [],
      remaining: 244,
      eaten: 0,
    };
  }

  start(): void {
    if (this.state.phase === "game-over") {
      this.restart();
      return;
    }
    if (this.state.phase !== "title") return;
    this.setPhase("ready");
    this.readyDuration = 2;
    this.events.push({ type: "start" });
  }

  restart(): void {
    const highScore = this.state.highScore;
    this.state = this.freshState(highScore);
    this.accumulator = 0;
    this.events = [];
    this.randomState = this.initialSeed;
    this.extraLifeAwarded = false;
    this.personalCounters = { blinky: 0, pinky: 0, inky: 0, clyde: 0 };
    this.resetActors(false);
    this.start();
  }

  input(dir: Direction): void {
    if (DIRECTIONS.includes(dir)) this.state.pacman.nextDir = dir;
  }

  togglePause(): void {
    if (this.state.phase === "title" || this.state.phase === "game-over")
      return;
    this.state.paused = !this.state.paused;
    this.accumulator = 0;
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  update(deltaSeconds: number): void {
    if (
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds <= 0 ||
      this.state.paused
    )
      return;
    this.accumulator += deltaSeconds;
    while (this.accumulator + EPSILON >= TICK_SECONDS) {
      this.accumulator -= TICK_SECONDS;
      if (this.accumulator < 0) this.accumulator = 0;
      this.tick();
    }
  }

  private random = (): number => {
    // xorshift32: the seed governs both frightened choices and fruit lifetimes.
    let x = this.randomState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 0x100000000;
  };

  private setPhase(phase: Phase): void {
    this.state.phase = phase;
    this.state.phaseTime = 0;
  }

  private tick(): void {
    const s = this.state;
    s.frame++;
    s.time += TICK_SECONDS;
    s.phaseTime += TICK_SECONDS;
    s.popups = s.popups.filter((popup) => (popup.ttl -= TICK_SECONDS) > 0);
    if (s.phase === "title" || s.phase === "game-over") return;
    if (s.phase === "ready") {
      if (s.phaseTime + EPSILON >= this.readyDuration) {
        this.setPhase("playing");
        this.events.push({ type: "ready" });
      }
      return;
    }
    if (s.phase === "dying") {
      if (s.phaseTime >= 2) {
        if (s.lives <= 0) {
          this.setPhase("game-over");
          this.events.push({ type: "game-over" });
        } else {
          this.resetActors(true);
          this.readyDuration = 1.5;
          this.setPhase("ready");
        }
      }
      return;
    }
    if (s.phase === "level-clear") {
      if (s.phaseTime >= 2.8) this.nextLevel();
      return;
    }
    if (this.scorePause > 0) {
      this.scorePause--;
      for (const ghost of s.ghosts)
        if (ghost.mode === "eyes") this.moveGhost(ghost);
      return;
    }

    this.updateTimers();
    this.updateHouseRelease();
    this.movePacman();
    if (s.phase !== "playing") return;
    for (const ghost of s.ghosts) this.moveGhost(ghost);
    this.checkFruit();
    this.checkCollisions();
  }

  private resetActors(afterDeath: boolean): void {
    const s = this.state;
    s.pacman = makePacman();
    s.ghosts = makeGhosts();
    s.mode = "scatter";
    s.frightenedRemaining = 0;
    s.frightChain = 0;
    s.fruit = null;
    s.popups = [];
    this.motions.clear();
    this.motions.set(s.pacman, { x: 13, y: 23 });
    this.motions.set(s.ghosts[0], { x: 13, y: 11 });
    this.routes.clear();
    this.reversePending.clear();
    this.nextGhostDirections.clear();
    this.exitRight.clear();
    this.revived.clear();
    this.modeIndex = 0;
    this.modeTicks = scatterSchedule(s.level)[0] * 60;
    this.frightenedTicks = 0;
    this.pelletPause = 0;
    this.scorePause = 0;
    this.releaseIdleTicks = 0;
    this.globalCounter = 0;
    this.globalCounterActive = afterDeath;
    this.elroyEnabled = !afterDeath;
    this.randomState = this.initialSeed;
  }

  private nextLevel(): void {
    const s = this.state;
    s.level++;
    const dots = initialPellets();
    s.pellets = dots.pellets;
    s.energizers = dots.energizers;
    s.remaining = 244;
    s.eaten = 0;
    s.fruitHistory = [...s.fruitHistory, fruitForLevel(s.level).kind].slice(-7);
    this.personalCounters = { blinky: 0, pinky: 0, inky: 0, clyde: 0 };
    this.resetActors(false);
    this.readyDuration = 1.5;
    this.setPhase("ready");
  }

  private updateTimers(): void {
    const s = this.state;
    if (s.fruit) {
      s.fruit.remaining -= TICK_SECONDS;
      if (s.fruit.remaining <= 0) s.fruit = null;
    }
    if (this.frightenedTicks > 0) {
      this.frightenedTicks--;
      s.frightenedRemaining = this.frightenedTicks * TICK_SECONDS;
      if (!this.frightenedTicks) {
        s.frightChain = 0;
        for (const ghost of s.ghosts) {
          ghost.frightenedVisual = false;
          if (ghost.mode === "frightened") ghost.mode = "normal";
        }
      }
      return; // Scatter/chase's clock stops during a power pellet.
    }
    if (Number.isFinite(this.modeTicks) && --this.modeTicks <= 0) {
      this.modeIndex++;
      this.modeTicks = scatterSchedule(s.level)[this.modeIndex] * 60;
      s.mode = this.modeIndex % 2 === 0 ? "scatter" : "chase";
      this.scheduleReversal();
    }
  }

  private scheduleReversal(): void {
    for (const ghost of this.state.ghosts) {
      if (ghost.mode === "eyes") continue;
      if (ghost.mode === "house") {
        // One or more mode changes inside latch a rightward exit.
        this.exitRight.add(ghost.id);
      } else if (ghost.mode === "leaving") {
        const route = this.routes.get(ghost.id);
        const last = route?.points.at(-1);
        if (last && route?.kind === "exit") last.x = 14;
      } else this.reversePending.add(ghost.id);
    }
  }

  private updateHouseRelease(): void {
    this.releaseIdleTicks++;
    const s = this.state,
      cfg = getLevelConfig(s.level);
    const waiting = RELEASE_ORDER.map(
      (id) => s.ghosts.find((g) => g.id === id)!,
    ).filter((g) => g.mode === "house");
    if (!waiting.length) return;
    const preferred = waiting[0];
    if (this.releaseIdleTicks >= cfg.releaseTimeout * 60) {
      this.releaseGhost(preferred);
      this.releaseIdleTicks = 0;
      return;
    }
    if (this.globalCounterActive) {
      if (preferred.id === "pinky" && this.globalCounter === 7)
        this.releaseGhost(preferred);
      else if (preferred.id === "inky" && this.globalCounter === 17)
        this.releaseGhost(preferred);
    } else {
      const index = RELEASE_ORDER.indexOf(preferred.id);
      if (this.personalCounters[preferred.id] >= cfg.releaseLimits[index])
        this.releaseGhost(preferred);
    }
  }

  private releaseGhost(ghost: Ghost): void {
    ghost.mode = "leaving";
    this.motions.delete(ghost);
    this.nextGhostDirections.delete(ghost.id);
    const right = this.exitRight.has(ghost.id);
    this.exitRight.delete(ghost.id);
    this.routes.set(ghost.id, {
      kind: "exit",
      points: [
        { x: ghost.x, y: 14 },
        { x: 13.5, y: 14 },
        { x: 13.5, y: 11 },
        { x: right ? 14 : 13, y: 11 },
      ],
    });
    if (ghost.id === "clyde") this.elroyEnabled = true;
  }

  private recordDot(): void {
    this.releaseIdleTicks = 0;
    if (this.globalCounterActive) {
      this.globalCounter++;
      if (
        this.globalCounter === 32 &&
        this.state.ghosts.find((g) => g.id === "clyde")!.mode === "house"
      ) {
        this.globalCounterActive = false;
        this.globalCounter = 0;
      }
    } else {
      const waiting = RELEASE_ORDER.find(
        (id) => this.state.ghosts.find((g) => g.id === id)!.mode === "house",
      );
      if (waiting) this.personalCounters[waiting]++;
    }
  }

  private movePacman(): void {
    const s = this.state,
      pac = s.pacman;
    if (this.pelletPause > 0) {
      this.pelletPause--;
      return;
    }
    const cfg = getLevelConfig(s.level);
    const speed =
      this.frightenedTicks > 0 ? cfg.poweredPacmanSpeed : cfg.pacmanSpeed;
    let motion = this.motions.get(pac);
    if (motion && pac.nextDir === OPPOSITE[pac.dir]) {
      // Reversal is immediate, even halfway between two centers.
      const v = VECTORS[pac.dir];
      motion = { x: motion.x - v.x, y: motion.y - v.y };
      this.motions.set(pac, motion);
      pac.dir = pac.nextDir;
    } else if (
      motion &&
      pac.nextDir !== pac.dir &&
      pac.nextDir !== OPPOSITE[pac.dir]
    ) {
      const v = VECTORS[pac.nextDir];
      const distance = Math.max(
        Math.abs(motion.x - pac.x),
        Math.abs(motion.y - pac.y),
      );
      // The pixel-center asymmetry gives left/up approaches four pre-turn
      // pixels and right/down approaches three, with the reverse post-turn
      // allowance. Diagonal motion settles onto the new center line.
      const before = pac.dir === "left" || pac.dir === "up" ? 0.5 : 0.375;
      if (
        distance <= before &&
        isWalkable(motion.x + v.x, motion.y + v.y, "pacman")
      ) {
        motion = { x: motion.x + v.x, y: motion.y + v.y };
        this.motions.set(pac, motion);
        pac.dir = pac.nextDir;
      } else {
        const old = VECTORS[pac.dir];
        const previous = { x: motion.x - old.x, y: motion.y - old.y };
        const after = pac.dir === "left" || pac.dir === "up" ? 0.375 : 0.5;
        const passed = Math.max(
          Math.abs(previous.x - pac.x),
          Math.abs(previous.y - pac.y),
        );
        if (
          passed <= after &&
          isWalkable(previous.x + v.x, previous.y + v.y, "pacman")
        ) {
          this.motions.set(pac, { x: previous.x + v.x, y: previous.y + v.y });
          pac.dir = pac.nextDir;
        }
      }
    }
    this.moveAlongGrid(pac, BASE_SPEED * speed * TICK_SECONDS, () => {
      const preferred = VECTORS[pac.nextDir];
      const current = VECTORS[pac.dir];
      if (isWalkable(pac.x + preferred.x, pac.y + preferred.y, "pacman"))
        return pac.nextDir;
      if (isWalkable(pac.x + current.x, pac.y + current.y, "pacman"))
        return pac.dir;
      return null;
    });
    this.consumeTile();
  }

  private consumeTile(): void {
    const s = this.state,
      tile = actorTile(s.pacman),
      tileKey = key(tile.x, tile.y);
    const power = s.energizers.delete(tileKey);
    if (!power && !s.pellets.delete(tileKey)) return;
    this.award(power ? 50 : 10);
    this.events.push({ type: power ? "energizer" : "pellet" });
    this.pelletPause = power ? 3 : 1;
    s.eaten++;
    s.remaining--;
    this.recordDot();
    if (power) {
      this.frightenedTicks = getLevelConfig(s.level).frightenedSeconds * 60;
      s.frightenedRemaining = this.frightenedTicks * TICK_SECONDS;
      s.frightChain = 0;
      this.revived.clear();
      this.scheduleReversal();
      for (const ghost of s.ghosts) {
        ghost.frightenedVisual =
          this.frightenedTicks > 0 && ghost.mode !== "eyes";
        if (ghost.mode === "normal" || ghost.mode === "frightened")
          ghost.mode = this.frightenedTicks > 0 ? "frightened" : "normal";
      }
    }
    if (s.eaten === 70 || s.eaten === 170) {
      s.fruit = {
        ...fruitForLevel(s.level),
        x: 13.5,
        y: 17,
        remaining: 9 + this.random(),
      };
    }
    if (s.remaining <= 0) {
      s.fruit = null;
      this.setPhase("level-clear");
      this.events.push({ type: "level", value: s.level });
    }
  }

  private elroyStage(): number {
    if (!this.elroyEnabled) return 0;
    const thresholds = getLevelConfig(this.state.level).elroyDots;
    return this.state.remaining <= thresholds[1]
      ? 2
      : this.state.remaining <= thresholds[0]
        ? 1
        : 0;
  }

  private moveGhost(ghost: Ghost): void {
    const cfg = getLevelConfig(this.state.level);
    if (this.routes.has(ghost.id)) {
      this.moveHouseRoute(ghost);
      return;
    }
    if (ghost.mode === "house") {
      ghost.y +=
        (ghost.dir === "up" ? -1 : 1) * BASE_SPEED * 0.3 * TICK_SECONDS;
      if (ghost.y <= 13.5) {
        ghost.y = 13.5;
        ghost.dir = "down";
      }
      if (ghost.y >= 14.5) {
        ghost.y = 14.5;
        ghost.dir = "up";
      }
      return;
    }
    const elroy = ghost.id === "blinky" ? this.elroyStage() : 0;
    ghost.target =
      ghost.mode === "eyes"
        ? { x: 13, y: 11 }
        : ghostTarget(
            ghost.id,
            this.state.pacman,
            this.state.ghosts[0],
            this.state.mode,
            elroy > 0,
            actorTile(ghost),
          );
    const inTunnel = ghost.y === 14 && (ghost.x < 6 || ghost.x > 21);
    const speed =
      ghost.mode === "eyes"
        ? 2
        : inTunnel
          ? cfg.tunnelSpeed
          : ghost.mode === "frightened"
            ? cfg.frightenedSpeed
            : elroy > 0
              ? cfg.elroySpeeds[elroy - 1]
              : cfg.ghostSpeed;
    this.moveAlongGrid(ghost, BASE_SPEED * speed * TICK_SECONDS, () => {
      if (ghost.mode === "eyes" && ghost.x === 13 && ghost.y === 11) {
        this.nextGhostDirections.delete(ghost.id);
        this.routes.set(ghost.id, {
          kind: "enter",
          points: [
            { x: 13.5, y: 11 },
            { x: 13.5, y: 14 },
            { x: HOME_X[ghost.id], y: 14 },
          ],
        });
        return null;
      }
      let direction: Direction | undefined;
      if (this.reversePending.delete(ghost.id)) {
        const opposite = OPPOSITE[ghost.dir],
          v = VECTORS[opposite];
        if (isWalkable(ghost.x + v.x, ghost.y + v.y, ghost.mode))
          direction = opposite;
      }
      direction ??= this.nextGhostDirections.get(ghost.id);
      direction ??= chooseGhostDirection(
        ghost,
        ghost.target,
        ghost.mode === "frightened",
        this.random,
      );
      const v = VECTORS[direction];
      // Ghosts commit their following turn one tile in advance. Pac-Man can
      // change direction after that decision without changing the saved turn.
      this.nextGhostDirections.set(
        ghost.id,
        chooseGhostDirection(
          {
            x: wrappedX(ghost.x + v.x),
            y: ghost.y + v.y,
            dir: direction,
            mode: ghost.mode,
          },
          ghost.target,
          ghost.mode === "frightened",
          this.random,
        ),
      );
      return direction;
    });
  }

  private moveHouseRoute(ghost: Ghost): void {
    const route = this.routes.get(ghost.id)!;
    let distance =
      BASE_SPEED * (route.kind === "enter" ? 1.6 : 0.4) * TICK_SECONDS;
    ghost.moving = true;
    while (distance > EPSILON && route.points.length) {
      const target = route.points[0];
      const dx = target.x - ghost.x,
        dy = target.y - ghost.y;
      const remaining = Math.max(Math.abs(dx), Math.abs(dy));
      if (remaining <= EPSILON) {
        route.points.shift();
        continue;
      }
      ghost.dir =
        Math.abs(dx) > EPSILON
          ? dx < 0
            ? "left"
            : "right"
          : dy < 0
            ? "up"
            : "down";
      const amount = Math.min(distance, remaining);
      ghost.x += Math.sign(dx) * Math.min(amount, Math.abs(dx));
      ghost.y += Math.sign(dy) * Math.min(amount, Math.abs(dy));
      distance -= amount;
      if (amount + EPSILON >= remaining) {
        ghost.x = target.x;
        ghost.y = target.y;
        route.points.shift();
      }
    }
    if (!route.points.length) {
      this.routes.delete(ghost.id);
      if (route.kind === "enter") {
        this.revived.add(ghost.id);
        ghost.frightenedVisual = false;
        this.reversePending.delete(ghost.id);
        ghost.mode = "house";
        ghost.dir = "up";
        // Blinky has no house counter. The others keep their release rules,
        // including the original global-counter ghost-house trapping quirk.
        if (ghost.id === "blinky") this.releaseGhost(ghost);
      } else {
        ghost.mode =
          this.frightenedTicks > 0 && !this.revived.has(ghost.id)
            ? "frightened"
            : "normal";
      }
    }
  }

  private moveAlongGrid(
    actor: Actor,
    distance: number,
    choose: () => Direction | null,
  ): void {
    actor.moving = true;
    while (distance > EPSILON) {
      let target = this.motions.get(actor);
      if (!target) {
        const direction = choose();
        if (!direction) {
          actor.moving = false;
          return;
        }
        actor.dir = direction;
        const v = VECTORS[direction];
        target = { x: actor.x + v.x, y: actor.y + v.y };
        this.motions.set(actor, target);
      }
      const dx = target.x - actor.x,
        dy = target.y - actor.y;
      const remaining = Math.max(Math.abs(dx), Math.abs(dy));
      if (remaining <= EPSILON) {
        this.motions.delete(actor);
        continue;
      }
      const amount = Math.min(distance, remaining);
      actor.x += Math.sign(dx) * Math.min(amount, Math.abs(dx));
      actor.y += Math.sign(dy) * Math.min(amount, Math.abs(dy));
      distance -= amount;
      if (amount + EPSILON >= remaining) {
        actor.x = target.x;
        actor.y = target.y;
        this.motions.delete(actor);
      }
      if (actor.x < -0.5) {
        actor.x += COLS;
        const motion = this.motions.get(actor);
        if (motion) motion.x += COLS;
      } else if (actor.x >= COLS - 0.5) {
        actor.x -= COLS;
        const motion = this.motions.get(actor);
        if (motion) motion.x -= COLS;
      }
    }
  }

  private checkFruit(): void {
    const s = this.state;
    if (
      !s.fruit ||
      Math.abs(s.pacman.x - s.fruit.x) > 0.6 ||
      Math.abs(s.pacman.y - s.fruit.y) > 0.5
    )
      return;
    const fruit = s.fruit;
    this.award(fruit.points);
    s.popups.push({
      x: fruit.x,
      y: fruit.y,
      text: String(fruit.points),
      ttl: 1.8,
    });
    this.events.push({ type: "fruit", value: fruit.points });
    s.fruit = null;
  }

  private checkCollisions(): void {
    const s = this.state,
      pac = actorTile(s.pacman);
    for (const ghost of s.ghosts) {
      if (
        ghost.mode === "eyes" ||
        ghost.mode === "house" ||
        ghost.mode === "leaving"
      )
        continue;
      const tile = actorTile(ghost);
      // The original checks occupied tiles, so a rare simultaneous tile swap
      // can pass through a ghost. Circular hitboxes would lose that behavior.
      if (pac.x !== tile.x || pac.y !== tile.y) continue;
      if (ghost.mode === "frightened") {
        const points = 200 * 2 ** Math.min(s.frightChain, 3);
        s.frightChain++;
        this.award(points);
        s.popups.push({
          x: ghost.x,
          y: ghost.y,
          text: String(points),
          ttl: 1.25,
        });
        this.events.push({ type: "ghost", value: points });
        ghost.mode = "eyes";
        ghost.frightenedVisual = false;
        this.reversePending.delete(ghost.id);
        this.nextGhostDirections.delete(ghost.id);
        this.scorePause = 60;
      } else {
        s.lives--;
        s.pacman.moving = false;
        this.setPhase("dying");
        this.events.push({ type: "death" });
        return;
      }
    }
  }

  private award(points: number): void {
    const s = this.state;
    s.score += points;
    s.highScore = Math.max(s.highScore, s.score);
    if (!this.extraLifeAwarded && s.score >= 10000) {
      this.extraLifeAwarded = true;
      s.lives++;
      this.events.push({ type: "extra-life" });
    }
  }
}

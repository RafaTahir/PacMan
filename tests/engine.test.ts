import { describe, expect, it } from "vitest";
import {
  COLS,
  ROWS,
  MAZE,
  initialPellets,
  isWalkable,
  key,
  tileAt,
} from "../src/maze";
import { fruitForLevel, getLevelConfig, scatterSchedule } from "../src/levels";
import { TICK_SECONDS, BASE_SPEED } from "../src/levels";
import { Game, ghostTarget, chooseGhostDirection } from "../src/engine";
import type { Direction, Ghost, GhostId } from "../src/types";

function playingGame(seed = 1980): Game {
  const game = new Game({ seed });
  game.start();
  game.update(122 * TICK_SECONDS);
  expect(game.state.phase).toBe("playing");
  game.drainEvents();
  return game;
}

// Replace the actor object when arranging a scenario: the simulation's motion
// destinations belong to the previous actor object, so teleports do not reuse them.
function placePacman(
  game: Game,
  x: number,
  y: number,
  dir: Direction = "up",
): void {
  game.state.pacman = { x, y, dir, nextDir: dir, moving: true };
}

function placeGhost(
  game: Game,
  id: GhostId,
  x: number,
  y: number,
  mode: Ghost["mode"] = "normal",
  dir: Direction = "left",
): Ghost {
  const ghost: Ghost = { id, x, y, mode, dir, moving: true, target: { x, y } };
  game.state.ghosts[game.state.ghosts.findIndex((g) => g.id === id)] = ghost;
  return ghost;
}

function eatDot(game: Game): void {
  placePacman(game, 1, 1);
  game.state.pellets.add(key(1, 1));
  game.update(2 * TICK_SECONDS);
}

describe("arcade maze data", () => {
  it("has exactly 240 dots and four energizers, all reachable without entering the house", () => {
    expect(MAZE).toHaveLength(31);
    expect(MAZE.every((row) => row.length === 28)).toBe(true);
    const { pellets, energizers } = initialPellets();
    expect(pellets.size).toBe(240);
    expect(energizers.size).toBe(4);
    expect([...energizers].sort((a, b) => a - b)).toEqual([
      key(1, 3),
      key(26, 3),
      key(1, 23),
      key(26, 23),
    ]);
    const queue = [[13, 23]];
    const reached = new Set<number>([key(13, 23)]);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [
        [0, -1],
        [-1, 0],
        [0, 1],
        [1, 0],
      ]) {
        const nx = (x + dx + COLS) % COLS;
        const ny = y + dy;
        const id = key(nx, ny);
        if (
          ny >= 0 &&
          ny < ROWS &&
          isWalkable(nx, ny, "pacman") &&
          !reached.has(id)
        ) {
          reached.add(id);
          queue.push([nx, ny]);
        }
      }
    }
    expect(
      [...pellets, ...energizers].filter((id) => !reached.has(id)),
    ).toEqual([]);
    expect(reached.has(key(13, 14))).toBe(false);
    expect(pellets.size * 10 + energizers.size * 50).toBe(2600);
  });

  it("restricts the door to house transit and permits wrapping only at the tunnel", () => {
    for (const x of [13, 14]) {
      expect(tileAt(x, 12)).toBe("-");
      for (const actor of [
        "pacman",
        "ghost",
        "normal",
        "frightened",
      ] as const) {
        expect(isWalkable(x, 12, actor)).toBe(false);
      }
      for (const actor of ["eyes", "house", "leaving"] as const) {
        expect(isWalkable(x, 12, actor)).toBe(true);
      }
    }
    expect(isWalkable(-1, 14, "pacman")).toBe(true);
    expect(isWalkable(28, 14, "pacman")).toBe(true);
    expect(isWalkable(0, 13, "pacman")).toBe(false);
    expect(isWalkable(27, 15, "pacman")).toBe(false);
    expect(isWalkable(-1, 1, "pacman")).toBe(false);
  });

  it("returns independently owned pellet sets for successive boards", () => {
    const first = initialPellets();
    first.pellets.clear();
    first.energizers.clear();
    expect(initialPellets().pellets.size).toBe(240);
    expect(initialPellets().energizers.size).toBe(4);
  });
});

describe("Dossier level table boundaries", () => {
  // Independent expected values transcribed from Appendix A, via docs/RESEARCH.md.
  it.each([
    [1, 0.8, 0.9, 0.75, 0.5, 0.4, 6, 5, 20, 10, 100],
    [2, 0.9, 0.95, 0.85, 0.55, 0.45, 5, 5, 30, 15, 300],
    [5, 1, 1, 0.95, 0.6, 0.5, 2, 5, 40, 20, 700],
    [6, 1, 1, 0.95, 0.6, 0.5, 5, 5, 50, 25, 700],
    [9, 1, 1, 0.95, 0.6, 0.5, 1, 3, 60, 30, 2000],
    [10, 1, 1, 0.95, 0.6, 0.5, 5, 5, 60, 30, 2000],
    [11, 1, 1, 0.95, 0.6, 0.5, 2, 5, 60, 30, 3000],
    [12, 1, 1, 0.95, 0.6, 0.5, 1, 3, 80, 40, 3000],
    [14, 1, 1, 0.95, 0.6, 0.5, 3, 5, 80, 40, 5000],
    [17, 1, 1, 0.95, 0.6, 0.5, 0, 0, 100, 50, 5000],
    [18, 1, 1, 0.95, 0.6, 0.5, 1, 3, 100, 50, 5000],
    [19, 1, 1, 0.95, 0.6, 0.5, 0, 0, 120, 60, 5000],
    [21, 0.9, 0.9, 0.95, 0.6, 0.5, 0, 0, 120, 60, 5000],
  ])(
    "level %i uses the documented speed, fright, Elroy and bonus values",
    (
      level,
      pacmanSpeed,
      poweredPacmanSpeed,
      ghostSpeed,
      frightenedSpeed,
      tunnelSpeed,
      frightenedSeconds,
      frightenedFlashes,
      first,
      second,
      points,
    ) => {
      expect(getLevelConfig(level)).toMatchObject({
        pacmanSpeed,
        poweredPacmanSpeed,
        ghostSpeed,
        frightenedSpeed,
        tunnelSpeed,
        frightenedSeconds,
        frightenedFlashes,
        elroyDots: [first, second],
      });
      expect(fruitForLevel(level).points).toBe(points);
    },
  );

  it("preserves long third chase and one-frame fourth scatter on later boards", () => {
    expect(scatterSchedule(1)).toEqual([7, 20, 7, 20, 5, 20, 5, Infinity]);
    for (const level of [2, 3, 4]) {
      expect(scatterSchedule(level)).toEqual([
        7,
        20,
        7,
        20,
        5,
        1033,
        1 / 60,
        Infinity,
      ]);
    }
    for (const level of [5, 6, 9, 10, 14, 17, 18, 19, 21]) {
      expect(scatterSchedule(level)).toEqual([
        5,
        20,
        5,
        20,
        5,
        1037,
        1 / 60,
        Infinity,
      ]);
    }
  });

  it("changes house release quotas independently from speed tiers", () => {
    expect(getLevelConfig(1).releaseLimits).toEqual([0, 30, 60]);
    expect(getLevelConfig(2).releaseLimits).toEqual([0, 0, 50]);
    expect(getLevelConfig(3).releaseLimits).toEqual([0, 0, 0]);
    expect(getLevelConfig(4).releaseTimeout).toBe(4);
    expect(getLevelConfig(5).releaseTimeout).toBe(3);
    expect(getLevelConfig(1).elroySpeeds).toEqual([0.8, 0.85]);
    expect(getLevelConfig(2).elroySpeeds).toEqual([0.9, 0.95]);
    expect(getLevelConfig(5).elroySpeeds).toEqual([1, 1.05]);
  });
});

describe("ghost target rules and local routing", () => {
  const blinky = { x: 5, y: 8 };
  it.each([
    ["up", { x: 6, y: 6 }, { x: 11, y: 8 }],
    ["left", { x: 6, y: 10 }, { x: 11, y: 12 }],
    ["down", { x: 10, y: 14 }, { x: 15, y: 16 }],
    ["right", { x: 14, y: 10 }, { x: 19, y: 12 }],
  ] as const)(
    "preserves Pinky and Inky offsets facing %s",
    (dir, pinky, inky) => {
      const pacman = { x: 10, y: 10, dir };
      expect(ghostTarget("blinky", pacman, blinky, "chase")).toEqual({
        x: 10,
        y: 10,
      });
      expect(ghostTarget("pinky", pacman, blinky, "chase")).toEqual(pinky);
      expect(ghostTarget("inky", pacman, blinky, "chase")).toEqual(inky);
    },
  );

  it("switches Clyde at exactly eight Euclidean tiles, including a diagonal boundary", () => {
    const pacman = { x: 10, y: 10, dir: "right" as const };
    expect(
      ghostTarget("clyde", pacman, blinky, "chase", false, { x: 18, y: 10 }),
    ).toEqual({ x: 10, y: 10 });
    expect(
      ghostTarget("clyde", pacman, blinky, "chase", false, { x: 17, y: 10 }),
    ).toEqual({ x: 0, y: 31 });
    expect(
      ghostTarget("clyde", pacman, blinky, "chase", false, { x: 15, y: 16 }),
    ).toEqual({ x: 0, y: 31 });
    expect(
      ghostTarget("clyde", pacman, blinky, "chase", false, { x: 16, y: 16 }),
    ).toEqual({ x: 10, y: 10 });
  });

  it("uses four off-maze scatter corners, except Elroy Blinky still pursues", () => {
    const pacman = { x: 10, y: 10, dir: "up" as const };
    const targets = (["blinky", "pinky", "inky", "clyde"] as const).map((id) =>
      ghostTarget(id, pacman, blinky, "scatter"),
    );
    expect(targets).toEqual([
      { x: 25, y: -3 },
      { x: 2, y: -3 },
      { x: 27, y: 31 },
      { x: 0, y: 31 },
    ]);
    expect(ghostTarget("blinky", pacman, blinky, "scatter", true)).toEqual({
      x: 10,
      y: 10,
    });
    expect(ghostTarget("pinky", pacman, blinky, "scatter", true)).toEqual({
      x: 2,
      y: -3,
    });
  });

  it("breaks equal-distance ties up, left, down, right and excludes reversal", () => {
    const ghost = {
      x: 6,
      y: 5,
      dir: "up" as Direction,
      mode: "normal" as const,
    };
    expect(chooseGhostDirection(ghost, { x: 5, y: 4 })).toBe("up");
    expect(
      chooseGhostDirection({ ...ghost, dir: "left" }, { x: 5, y: 6 }),
    ).toBe("left");
    expect(
      chooseGhostDirection({ ...ghost, dir: "down" }, { x: 7, y: 6 }),
    ).toBe("down");
    expect(chooseGhostDirection(ghost, { x: 6, y: 20 })).toBe("left");
  });

  it.each([
    [12, 11],
    [15, 11],
    [12, 23],
    [15, 23],
  ])(
    "restricts upward turns at (%i,%i), with frightened and eyes exceptions",
    (x, y) => {
      const ghost = { x, y, dir: "right" as const, mode: "normal" as const };
      expect(chooseGhostDirection(ghost, { x, y: -10 })).toBe("right");
      expect(
        chooseGhostDirection({ ...ghost, mode: "eyes" }, { x, y: -10 }),
      ).toBe("up");
      expect(
        chooseGhostDirection(
          { ...ghost, mode: "frightened" },
          { x, y: -10 },
          true,
          () => 0,
        ),
      ).toBe("up");
    },
  );

  it("tries frightened directions clockwise from a random cardinal direction, skipping walls and reversal", () => {
    const ghost = {
      x: 6,
      y: 5,
      dir: "right" as const,
      mode: "frightened" as const,
    };
    // Left is the reverse: a draw in its quadrant must wrap around to up.
    expect(chooseGhostDirection(ghost, { x: 99, y: 99 }, true, () => 0.9)).toBe(
      "up",
    );
    // At this junction down is a wall and left is reverse, so down also wraps to up.
    expect(
      chooseGhostDirection(
        { ...ghost, x: 12, y: 11 },
        { x: 99, y: 99 },
        true,
        () => 0.6,
      ),
    ).toBe("up");
    expect(chooseGhostDirection(ghost, { x: 99, y: 99 }, true, () => 0.3)).toBe(
      "right",
    );
  });
});

describe("fixed tick simulation and player controls", () => {
  it("produces the same complete state and events with 30Hz, 144Hz, and irregular deltas", () => {
    function run(deltas: number[]): Game {
      const game = new Game({ seed: 12345 });
      game.start();
      for (const direction of ["left", "up", "right", "down"] as const) {
        game.input(direction);
        let elapsed = 0,
          index = 0;
        while (elapsed < 3 - 1e-10) {
          const step = Math.min(deltas[index++ % deltas.length], 3 - elapsed);
          game.update(step);
          elapsed += step;
        }
      }
      return game;
    }
    const reference = run([1 / 30]);
    const referenceEvents = reference.drainEvents();
    for (const deltas of [[1 / 144], [0.002, 0.041, 0.009, 0.017]]) {
      const other = run(deltas);
      expect(other.state).toEqual(reference.state);
      expect(other.drainEvents()).toEqual(referenceEvents);
    }
  });

  it("stops simulation during pause, ignores invalid deltas, and resumes without catchup", () => {
    const game = playingGame();
    game.togglePause();
    const before = structuredClone(game.state);
    game.update(100);
    expect(game.state).toEqual(before);
    game.togglePause();
    const frame = game.state.frame;
    for (const invalid of [NaN, Infinity, -1, 0]) game.update(invalid);
    expect(game.state.frame).toBe(frame);
    game.update(TICK_SECONDS);
    expect(game.state.frame).toBe(frame + 1);
  });

  it("reverses immediately between tile centers", () => {
    const game = playingGame();
    game.state.pellets.clear();
    placePacman(game, 4, 5, "right");
    game.update(TICK_SECONDS);
    const x = game.state.pacman.x;
    expect(x).toBeGreaterThan(4);
    game.input("left");
    game.update(TICK_SECONDS);
    expect(game.state.pacman.dir).toBe("left");
    expect(game.state.pacman.x).toBeLessThan(x);
  });

  it("buffers a blocked turn until reaching a legal intersection", () => {
    const game = playingGame();
    game.state.pellets.clear();
    placePacman(game, 4, 5, "right");
    game.input("up");
    game.update(8 * TICK_SECONDS);
    expect(game.state.pacman.y).toBe(5);
    expect(game.state.pacman.dir).toBe("right");
    game.update(12 * TICK_SECONDS);
    expect(game.state.pacman.dir).toBe("up");
    expect(game.state.pacman.y).toBeLessThan(5);
    expect(game.state.pacman.x).toBeCloseTo(6);
  });

  it("wraps Pac-Man at the tunnel without applying ghost tunnel slowdown", () => {
    const game = playingGame();
    placePacman(game, 0, 14, "left");
    game.update(8 * TICK_SECONDS);
    expect(game.state.pacman.x).toBeCloseTo(27);
    expect(game.state.pacman.y).toBe(14);
    expect(
      BASE_SPEED * getLevelConfig(1).pacmanSpeed * TICK_SECONDS * 8,
    ).toBeCloseTo(1);
  });

  it.each([
    [1, 0.8, 0.75, 0.4],
    [2, 0.9, 0.85, 0.45],
    [5, 1, 0.95, 0.5],
    [21, 0.9, 0.95, 0.5],
  ])(
    "applies actual movement speeds and ghost-only tunnel slowdown at level %i",
    (level, pacSpeed, ghostSpeed, tunnelSpeed) => {
      const game = playingGame();
      game.state.level = level;
      game.state.pellets.clear();
      placePacman(game, 3, 5, "right");
      const ordinary = placeGhost(game, "blinky", 3, 29, "normal", "right");
      const tunnel = placeGhost(game, "inky", 2, 14, "normal", "left");
      game.update(TICK_SECONDS);
      expect(game.state.pacman.x - 3).toBeCloseTo((pacSpeed * 1.25) / 8);
      expect(Math.abs(ordinary.x - 3)).toBeCloseTo((ghostSpeed * 1.25) / 8);
      expect(Math.abs(tunnel.x - 2)).toBeCloseTo((tunnelSpeed * 1.25) / 8);
    },
  );
});

describe("scoring, power pellets, lives, and board transitions", () => {
  it("awards one normal-dot score and pauses movement for exactly one subsequent frame", () => {
    const game = playingGame();
    placePacman(game, 1, 1, "right");
    game.update(TICK_SECONDS);
    expect(game.state.score).toBe(10);
    expect(game.state.remaining).toBe(243);
    expect(game.state.eaten).toBe(1);
    const x = game.state.pacman.x;
    game.update(TICK_SECONDS);
    expect(game.state.pacman.x).toBe(x);
    game.update(TICK_SECONDS);
    expect(game.state.pacman.x).toBeGreaterThan(x);
    expect(game.state.score).toBe(10);
    expect(game.drainEvents().filter((e) => e.type === "pellet")).toHaveLength(
      1,
    );
  });

  it("awards 50 for an energizer, resets the chain, and pauses movement for three frames", () => {
    const game = playingGame();
    game.state.frightChain = 3;
    placePacman(game, 1, 3, "up");
    game.update(TICK_SECONDS);
    expect(game.state.score).toBe(50);
    expect(game.state.frightChain).toBe(0);
    expect(game.state.frightenedRemaining).toBeGreaterThan(5.9);
    expect(game.state.ghosts[0].mode).toBe("frightened");
    const y = game.state.pacman.y;
    game.update(3 * TICK_SECONDS);
    expect(game.state.pacman.y).toBe(y);
    game.update(TICK_SECONDS);
    expect(game.state.pacman.y).toBeLessThan(y);
  });

  it("scores all four ghost captures 200/400/800/1600 and makes eyes harmless", () => {
    const game = playingGame();
    placePacman(game, 1, 1);
    game.state.pellets.delete(key(1, 1));
    for (const id of ["blinky", "pinky", "inky", "clyde"] as const)
      placeGhost(game, id, 1, 1, "frightened").frightenedVisual = true;
    game.update(TICK_SECONDS);
    expect(
      game
        .drainEvents()
        .filter((e) => e.type === "ghost")
        .map((e) => e.value),
    ).toEqual([200, 400, 800, 1600]);
    expect(game.state.score).toBe(3000);
    expect(game.state.frightChain).toBe(4);
    expect(game.state.ghosts.every((g) => g.mode === "eyes")).toBe(true);
    expect(game.state.ghosts.every((g) => g.frightenedVisual === false)).toBe(true);
    game.update(62 * TICK_SECONDS);
    expect(game.state.lives).toBe(3);
    expect(game.state.phase).toBe("playing");
  });

  it("grants exactly one extra life at 10,000 and retains high score through restart", () => {
    const game = playingGame();
    game.state.score = 9990;
    eatDot(game);
    expect(game.state.score).toBe(10000);
    expect(game.state.lives).toBe(4);
    expect(
      game.drainEvents().filter((e) => e.type === "extra-life"),
    ).toHaveLength(1);
    eatDot(game);
    expect(game.state.lives).toBe(4);
    expect(
      game.drainEvents().filter((e) => e.type === "extra-life"),
    ).toHaveLength(0);
    game.restart();
    expect(game.state).toMatchObject({
      score: 0,
      highScore: 10010,
      lives: 3,
      phase: "ready",
      level: 1,
      remaining: 244,
      eaten: 0,
    });
  });

  it.each([70, 170])(
    "spawns fruit at exactly %i board dots and awards it once",
    (threshold) => {
      const game = playingGame();
      game.state.eaten = threshold - 2;
      game.state.remaining = 244 - game.state.eaten;
      eatDot(game);
      expect(game.state.fruit).toBeNull();
      eatDot(game);
      expect(game.state.fruit).toMatchObject({ kind: "cherry", points: 100 });
      expect(game.state.fruit!.remaining).toBeGreaterThan(9 - 2 * TICK_SECONDS);
      expect(game.state.fruit!.remaining).toBeLessThanOrEqual(10);
      placePacman(game, 13, 17, "right");
      game.update(TICK_SECONDS);
      expect(game.state.fruit).toBeNull();
      expect(game.state.score).toBe(120);
      game.update(TICK_SECONDS);
      expect(game.state.score).toBe(120);
      expect(game.drainEvents().filter((e) => e.type === "fruit")).toEqual([
        { type: "fruit", value: 100 },
      ]);
    },
  );

  it("retains cleared dots, board progress and score after losing a life", () => {
    const game = playingGame();
    eatDot(game);
    placeGhost(game, "blinky", 1, 1);
    game.update(TICK_SECONDS);
    expect(game.state.phase).toBe("dying");
    expect(game.state.lives).toBe(2);
    const pellets = new Set(game.state.pellets);
    game.update(122 * TICK_SECONDS);
    expect(game.state.phase).toBe("ready");
    expect(game.state.pellets).toEqual(pellets);
    expect(game.state).toMatchObject({
      score: 10,
      level: 1,
      remaining: 243,
      eaten: 1,
      mode: "scatter",
      frightenedRemaining: 0,
      frightChain: 0,
    });
    expect(game.state.pacman).toMatchObject({ x: 13.5, y: 23, dir: "left" });
  });

  it("completes a board only after its last remaining dot, then applies the next level", () => {
    const game = playingGame();
    game.state.pellets = new Set([key(1, 1)]);
    game.state.energizers.clear();
    game.state.eaten = 243;
    game.state.remaining = 1;
    placePacman(game, 1, 1);
    game.update(TICK_SECONDS);
    expect(game.state.phase).toBe("level-clear");
    expect(game.state.remaining).toBe(0);
    expect(game.drainEvents()).toContainEqual({ type: "level", value: 1 });
    game.update(171 * TICK_SECONDS);
    expect(game.state).toMatchObject({
      phase: "ready",
      level: 2,
      score: 10,
      lives: 3,
      remaining: 244,
      eaten: 0,
    });
    expect(game.state.pellets.size).toBe(240);
    expect(game.state.energizers.size).toBe(4);
    expect(game.state.fruitHistory).toEqual(["cherry", "strawberry"]);
  });

  it("ends the game when the last life is lost and starts a clean board on start", () => {
    const game = playingGame();
    game.state.lives = 1;
    game.state.pellets.delete(key(1, 1));
    placePacman(game, 1, 1);
    placeGhost(game, "blinky", 1, 1);
    game.update(TICK_SECONDS);
    game.update(122 * TICK_SECONDS);
    expect(game.state.phase).toBe("game-over");
    expect(game.drainEvents()).toContainEqual({ type: "game-over" });
    game.start();
    expect(game.state).toMatchObject({
      phase: "ready",
      lives: 3,
      remaining: 244,
      score: 0,
    });
  });
});

// Set countdowns immediately before significant transitions rather than simulate
// long routes whose incidental collisions would obscure the rule under test.
interface ScenarioTimers {
  modeTicks: number;
  frightenedTicks: number;
  releaseIdleTicks: number;
  globalCounterActive: boolean;
  globalCounter: number;
  personalCounters: Record<GhostId, number>;
}
const timers = (game: Game) => game as unknown as ScenarioTimers;

describe("mode transitions and ghost house counters", () => {
  it("shows frightened house and exiting ghosts without changing their movement states", () => {
    const game = playingGame();
    placePacman(game, 1, 3);
    game.update(TICK_SECONDS);
    expect(game.state.ghosts.find((g) => g.id === "pinky")).toMatchObject({
      mode: "leaving",
      frightenedVisual: true,
    });
    expect(game.state.ghosts.find((g) => g.id === "inky")).toMatchObject({
      mode: "house",
      frightenedVisual: true,
    });
    expect(game.state.ghosts.find((g) => g.id === "clyde")).toMatchObject({
      mode: "house",
      frightenedVisual: true,
    });
    timers(game).frightenedTicks = 1;
    game.update(TICK_SECONDS);
    expect(game.state.ghosts.every((g) => g.frightenedVisual === false)).toBe(true);
    expect(game.state.ghosts.find((g) => g.id === "inky")!.mode).toBe("house");
  });

  it("keeps returning eyes and revived house ghosts uncolored until a new energizer", () => {
    const game = playingGame();
    placePacman(game, 1, 3);
    const inky = placeGhost(game, "inky", 13, 11, "eyes");
    game.update(TICK_SECONDS);
    expect(inky.frightenedVisual).toBe(false);
    game.update(40 * TICK_SECONDS);
    expect(game.state.frightenedRemaining).toBeGreaterThan(0);
    expect(inky).toMatchObject({ mode: "house", frightenedVisual: false });
    placePacman(game, 26, 3);
    game.update(TICK_SECONDS);
    expect(inky).toMatchObject({ mode: "house", frightenedVisual: true });
    game.restart();
    expect(game.state.ghosts.every((g) => g.frightenedVisual === false)).toBe(true);
  });

  it.each(["house", "leaving"] as const)(
    "latches a rightward exit across repeated reversals while %s",
    (initialMode) => {
      const game = playingGame();
      placePacman(game, 1, 1);
      game.state.pellets.delete(key(1, 1));
      const pinky = game.state.ghosts.find((g) => g.id === "pinky")!;
      timers(game).globalCounterActive = initialMode === "house";
      if (initialMode === "leaving") game.update(TICK_SECONDS);
      expect(pinky.mode).toBe(initialMode);
      for (let i = 0; i < 2; i++) {
        timers(game).modeTicks = 1;
        game.update(TICK_SECONDS);
      }
      if (initialMode === "house") {
        timers(game).releaseIdleTicks = 239;
        game.update(TICK_SECONDS);
      }
      for (let i = 0; i < 100 && pinky.mode === "leaving"; i++)
        game.update(TICK_SECONDS);
      expect(pinky).toMatchObject({ mode: "normal", x: 14, y: 11, dir: "right" });
    },
  );

  it.each([
    [21, 0.75, false],
    [20, 0.8, true],
    [11, 0.8, true],
    [10, 0.85, true],
  ])(
    "applies Elroy speed and scatter targeting at %i dots remaining",
    (remaining, speed, pursues) => {
      const game = playingGame();
      game.state.remaining = remaining;
      placePacman(game, 1, 1);
      game.state.pellets.delete(key(1, 1));
      const blinky = placeGhost(game, "blinky", 3, 29, "normal", "right");
      game.update(TICK_SECONDS);
      expect(blinky.x - 3).toBeCloseTo((speed * 1.25) / 8);
      expect(blinky.target).toEqual(
        pursues ? { x: 1, y: 1 } : { x: 25, y: -3 },
      );
    },
  );

  it("revives returning Blinky as dangerous even while the original energizer remains active", () => {
    const game = playingGame();
    placePacman(game, 1, 1);
    game.state.pellets.delete(key(1, 1));
    const blinky = placeGhost(game, "blinky", 13, 11, "eyes");
    timers(game).frightenedTicks = 360;
    game.update(100 * TICK_SECONDS);
    expect(game.state.frightenedRemaining).toBeGreaterThan(0);
    expect(blinky.mode).toBe("normal");
    expect(game.state.lives).toBe(3);
  });

  it("makes returning Inky wait for its personal quota instead of immediately exiting", () => {
    const game = playingGame();
    placePacman(game, 1, 1);
    game.state.pellets.delete(key(1, 1));
    const inky = placeGhost(game, "inky", 13, 11, "eyes");
    game.update(35 * TICK_SECONDS);
    expect(inky.mode).toBe("house");
    expect(timers(game).personalCounters.inky).toBe(0);
    expect(inky.x).toBe(11.5);
  });

  it("pauses scatter time throughout frightened mode, then resumes without an expiry reversal", () => {
    const game = playingGame();
    placePacman(game, 1, 1);
    game.state.pellets.delete(key(1, 1));
    timers(game).modeTicks = 2;
    timers(game).frightenedTicks = 2;
    const blinky = placeGhost(game, "blinky", 6, 5, "frightened", "right");
    game.update(TICK_SECONDS);
    expect(game.state.mode).toBe("scatter");
    expect(timers(game).modeTicks).toBe(2);
    const direction = blinky.dir;
    game.update(TICK_SECONDS);
    expect(blinky.mode).toBe("normal");
    expect(blinky.dir).toBe(direction);
    expect(timers(game).modeTicks).toBe(2);
    game.update(TICK_SECONDS);
    expect(game.state.mode).toBe("scatter");
    game.update(TICK_SECONDS);
    expect(game.state.mode).toBe("chase");
  });

  it.each([17, 19, 21])(
    "energizers still reverse ghosts with zero frightened duration on level %i",
    (level) => {
      const game = playingGame();
      game.state.level = level;
      placePacman(game, 1, 3);
      const blinky = placeGhost(game, "blinky", 6, 5, "normal", "right");
      game.update(TICK_SECONDS);
      expect(game.state.frightenedRemaining).toBe(0);
      expect(game.state.ghosts.every((g) => g.frightenedVisual === false)).toBe(true);
      expect(blinky.mode).toBe("normal");
      expect(blinky.dir).toBe("left");
      expect(game.state.score).toBe(50);
    },
  );

  it("increments only the highest-priority waiting personal counter", () => {
    const game = playingGame();
    eatDot(game);
    expect(timers(game).personalCounters).toMatchObject({
      pinky: 0,
      inky: 1,
      clyde: 0,
    });
    for (let i = 0; i < 29; i++) eatDot(game);
    expect(game.state.ghosts.find((g) => g.id === "inky")!.mode).toBe(
      "leaving",
    );
    expect(timers(game).personalCounters).toMatchObject({ inky: 30, clyde: 0 });
    for (let i = 0; i < 30; i++) eatDot(game);
    expect(game.state.eaten).toBe(60);
    expect(game.state.ghosts.find((g) => g.id === "clyde")!.mode).toBe("house");
    expect(timers(game).personalCounters.clyde).toBe(30);
    for (let i = 0; i < 30; i++) eatDot(game);
    expect(game.state.ghosts.find((g) => g.id === "clyde")!.mode).toBe(
      "leaving",
    );
  });

  it.each([
    ["pinky", 7],
    ["inky", 17],
  ] as const)(
    "releases %s only at the exact global quota %i, preserving the returning-ghost trap",
    (id, quota) => {
      const atQuota = playingGame();
      const pastQuota = playingGame();
      for (const [game, count] of [
        [atQuota, quota],
        [pastQuota, quota + 1],
      ] as const) {
        // Prepare a returned ghost inside while earlier-priority ghosts are out.
        placePacman(game, 1, 1);
        game.state.pellets.delete(key(1, 1));
        placeGhost(game, "pinky", 20, 29, "normal");
        placeGhost(game, id, id === "pinky" ? 13.5 : 11.5, 14, "house");
        timers(game).globalCounterActive = true;
        timers(game).globalCounter = count;
        game.update(TICK_SECONDS);
      }
      expect(atQuota.state.ghosts.find((g) => g.id === id)!.mode).toBe(
        "leaving",
      );
      expect(pastQuota.state.ghosts.find((g) => g.id === id)!.mode).toBe(
        "house",
      );
    },
  );

  it.each([true, false])(
    "global count 32 resumes personal counters only when Clyde is inside: %s",
    (clydeInside) => {
      const game = playingGame();
      placeGhost(game, "pinky", 20, 29, "normal");
      placeGhost(game, "inky", 22, 29, "normal");
      if (!clydeInside) placeGhost(game, "clyde", 24, 29, "normal");
      timers(game).globalCounterActive = true;
      timers(game).globalCounter = 31;
      eatDot(game);
      expect(timers(game).globalCounterActive).toBe(!clydeInside);
      expect(timers(game).globalCounter).toBe(clydeInside ? 0 : 32);
      if (clydeInside)
        expect(game.state.ghosts.find((g) => g.id === "clyde")!.mode).toBe(
          "house",
        );
    },
  );

  it.each([
    [1, 4],
    [5, 3],
  ])(
    "inactivity releases a waiting ghost after the level %i timeout",
    (level, timeout) => {
      const game = playingGame();
      game.state.level = level;
      placePacman(game, 1, 1);
      game.state.pellets.delete(key(1, 1));
      timers(game).globalCounterActive = true;
      timers(game).globalCounter = 0;
      timers(game).releaseIdleTicks = timeout * 60 - 2;
      game.update(TICK_SECONDS);
      expect(game.state.ghosts.find((g) => g.id === "pinky")!.mode).toBe(
        "house",
      );
      game.update(TICK_SECONDS);
      expect(game.state.ghosts.find((g) => g.id === "pinky")!.mode).toBe(
        "leaving",
      );
    },
  );
});

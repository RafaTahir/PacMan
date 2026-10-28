import { Game } from "../src/engine";
import { TICK_RATE as PACMAN_RATE, TICK_SECONDS } from "../src/levels";
import { createSimulation as rally } from "../src/arcade/games/neon-rally/model";
import { createSimulation as breaker } from "../src/arcade/games/reactor-breaker/model";
import { createSimulation as siege } from "../src/arcade/games/chrome-siege/model";
import { createSimulation as pinball } from "../src/arcade/games/midnight-pinball/model";
import { createSimulation as orbit } from "../src/arcade/games/orbit-salvage/model";
import { createSimulation as tidal } from "../src/arcade/games/tidal-courier/model";
import { createSimulation as prism } from "../src/arcade/games/prism-circuit/model";
import { createSimulation as skybound } from "../src/arcade/games/skybound-stack/model";
import { createSimulation as canopy } from "../src/arcade/games/canopy-sprint/model";
import { MAX_TICKS, NEUTRAL_INPUT, TICK_RATE, type ArcadeInput, type GameId, type ReplayInput } from "../src/arcade/shared/contracts";
import { ApiError } from "./errors";

export const simulationFactories = { "neon-rally": rally, "reactor-breaker": breaker, "chrome-siege": siege, "midnight-pinball": pinball, "orbit-salvage": orbit, "tidal-courier": tidal, "prism-circuit": prism, "skybound-stack": skybound, "canopy-sprint": canopy };

export function runLimits(game: GameId): { tickRate: number; maxTicks: number } {
  return game === "pacman"
    ? { tickRate: PACMAN_RATE, maxTicks: Math.floor(120 / TICK_SECONDS) }
    : { tickRate: TICK_RATE, maxTicks: MAX_TICKS };
}

export function validateReplay(game: GameId, frames: unknown, inputs: unknown): { frames: number; inputs: ReplayInput[] } {
  const { maxTicks } = runLimits(game);
  if (!Number.isInteger(frames) || (frames as number) < 1 || (frames as number) > maxTicks)
    throw new ApiError(400, "invalid_frames", `frames must be an integer from 1 to ${maxTicks}.`);
  if (!Array.isArray(inputs) || inputs.length > (frames as number) + 1)
    throw new ApiError(400, "invalid_replay", "Replay input count exceeds the run length.");
  let previous = -1;
  let previousInput: ArcadeInput = { ...NEUTRAL_INPUT };
  for (const row of inputs) {
    if (!Array.isArray(row) || row.length !== 6 || !row.every(Number.isInteger))
      throw new ApiError(400, "invalid_replay", "Every replay input must contain six integers.");
    const [tick, x, y, aimX, aimY, buttons] = row as ReplayInput;
    if (tick <= previous || tick < 0 || tick >= (frames as number))
      throw new ApiError(400, "invalid_replay", "Replay ticks must be unique, ordered and inside the run.");
    if ([x, y, aimX, aimY].some((axis) => axis < -127 || axis > 127) || buttons < 0 || buttons > 15)
      throw new ApiError(400, "invalid_replay", "Replay axes or buttons are out of range.");
    if (game === "pacman" && (buttons !== 0 || (x !== 0 && y !== 0)))
      throw new ApiError(400, "invalid_replay", "Pac-Man accepts cardinal directions and zero buttons.");
    if (x === previousInput.x && y === previousInput.y && aimX === previousInput.aimX && aimY === previousInput.aimY && buttons === previousInput.buttons)
      throw new ApiError(400, "invalid_replay", "Replay inputs must record changes only.");
    previous = tick;
    previousInput = { x, y, aimX, aimY, buttons };
  }
  return { frames: frames as number, inputs: inputs as ReplayInput[] };
}

/** Both clients and verifier use the same pure fixed-step model and seed. */
export function replayScore(gameId: GameId, seed: number, frames: number, inputs: ReplayInput[]): number {
  let next = 0;
  let input: ArcadeInput = { ...NEUTRAL_INPUT };
  let terminal = false;
  let score = 0;
  if (gameId === "pacman") {
    const game = new Game({ seed });
    game.start();
    for (let tick = 0; tick < frames; tick++) {
      if (terminal) throw new ApiError(400, "trailing_frames", "Replay continues after the game ended.");
      if (inputs[next]?.[0] === tick) {
        const [, x, y, aimX, aimY, buttons] = inputs[next++];
        input = { x, y, aimX, aimY, buttons };
        if (x < 0) game.input("left");
        else if (x > 0) game.input("right");
        else if (y < 0) game.input("up");
        else if (y > 0) game.input("down");
      }
      game.update(TICK_SECONDS);
      game.drainEvents();
      terminal = game.state.phase === "game-over";
    }
    score = game.state.score;
  } else {

    const simulation = simulationFactories[gameId](seed);
    for (let tick = 0; tick < frames; tick++) {
      if (terminal) throw new ApiError(400, "trailing_frames", "Replay continues after the game ended.");
      if (inputs[next]?.[0] === tick) {
        const [, x, y, aimX, aimY, buttons] = inputs[next++];
        input = { x, y, aimX, aimY, buttons };
      }
      simulation.step(input);
      if (simulation.state.tick !== tick + 1) throw new Error("Simulation clock mismatch");
      terminal = simulation.state.status !== "playing";
    }
    score = simulation.state.score;
  }
  if (!terminal && frames !== runLimits(gameId).maxTicks)
    throw new ApiError(400, "unfinished_run", "Submit a completed game or the full two-minute ranked run.");
  if (!Number.isSafeInteger(score) || score < 0) throw new Error("Simulation score out of bounds");
  return score;
}

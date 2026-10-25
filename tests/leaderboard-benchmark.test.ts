import { expect, it } from "vitest";
import { Game } from "../src/engine";
import { TICK_SECONDS } from "../src/levels";
import { GAME_IDS, NEUTRAL_INPUT, type ArcadeInput, type GameId, type ReplayInput } from "../src/arcade/shared/contracts";
import { createSimulation as rally } from "../src/arcade/games/neon-rally/model";
import { createSimulation as breaker } from "../src/arcade/games/reactor-breaker/model";
import { createSimulation as siege } from "../src/arcade/games/chrome-siege/model";
import { createSimulation as pinball } from "../src/arcade/games/midnight-pinball/model";
import { replayScore, runLimits } from "../server/replay";

function activeInput(game: GameId, tick: number): ArcadeInput {
  const phase = Math.floor(tick / 45) % 4;
  if (game === "pacman") return { x: phase === 0 ? -127 : phase === 2 ? 127 : 0, y: phase === 1 ? -127 : phase === 3 ? 127 : 0, aimX: 0, aimY: -127, buttons: 0 };
  if (game === "neon-rally") return { x: phase === 0 ? -25 : phase === 2 ? 25 : 0, y: 35, aimX: 0, aimY: -127, buttons: tick % 90 < 45 ? 1 : 2 };
  if (game === "reactor-breaker") return { x: 0, y: 0, aimX: Math.round(Math.sin(tick / 120) * 100), aimY: -127, buttons: 1 | 8 };
  if (game === "chrome-siege") return { x: Math.round(Math.sin(tick / 140) * 127), y: Math.round(Math.cos(tick / 140) * 127), aimX: Math.round(Math.cos(tick / 20) * 127), aimY: Math.round(Math.sin(tick / 20) * 127), buttons: 1 | (tick % 180 < 12 ? 2 : 0) };
  return { x: 0, y: 0, aimX: 0, aimY: -127, buttons: (tick % 100 < 70 ? 4 : 0) | (tick % 30 < 15 ? 1 : 2) };
}
function sample(game: GameId, seed: number, active: boolean): { frames: number; inputs: ReplayInput[]; score: number } {
  const inputs: ReplayInput[] = [];
  let last: ArcadeInput = { ...NEUTRAL_INPUT };
  const pacman = game === "pacman" ? new Game({ seed }) : null;
  pacman?.start();
  const simulation = game === "pacman" ? null : { "neon-rally": rally, "reactor-breaker": breaker, "chrome-siege": siege, "midnight-pinball": pinball }[game](seed);
  let frames = 0;
  while (frames < runLimits(game).maxTicks && (pacman ? pacman.state.phase !== "game-over" : simulation!.state.status === "playing")) {
    const input = active ? activeInput(game, frames) : { ...NEUTRAL_INPUT };
    if (Object.keys(input).some((key) => input[key as keyof ArcadeInput] !== last[key as keyof ArcadeInput])) {
      inputs.push([frames, input.x, input.y, input.aimX, input.aimY, input.buttons]);
      last = input;
    }
    if (pacman) {
      if (input.x) pacman.input(input.x < 0 ? "left" : "right");
      else if (input.y) pacman.input(input.y < 0 ? "up" : "down");
      pacman.update(TICK_SECONDS); pacman.drainEvents();
    } else simulation!.step(input);
    frames++;
  }
  return { frames, inputs, score: pacman ? pacman.state.score : simulation!.state.score };
}

it("benchmarks bounded complete verifier replays for every game and checks their derived scores", () => {
  const report: Record<string, { maxMs: number; maxFrames: number; maxInputs: number }> = {};
  for (const game of GAME_IDS) {
    let maxMs = 0, maxFrames = 0, maxInputs = 0;
    for (const seed of [1, 1980, 0x12345678]) for (const active of [false, true]) {
      const replay = sample(game, seed, active);
      const start = performance.now();
      expect(replayScore(game, seed, replay.frames, replay.inputs)).toBe(replay.score);
      maxMs = Math.max(maxMs, performance.now() - start);
      maxFrames = Math.max(maxFrames, replay.frames);
      maxInputs = Math.max(maxInputs, replay.inputs.length);
    }
    report[game] = { maxMs: Math.round(maxMs * 100) / 100, maxFrames, maxInputs };
    // Broad regression guard; individual timing observations are not a promise
    // about production Worker CPU quotas or adversarial optimum play.
    expect(maxMs).toBeLessThan(1000);
  }
  console.info("Verifier replay benchmark (Node wall time, six complete samples/game):", JSON.stringify(report));
});

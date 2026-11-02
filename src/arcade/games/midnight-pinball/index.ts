import type { GameDefinition } from "../../shared/contracts";
import { marketObjective } from "./market";
import { createSimulation, type PinballState } from "./model";
import { createView } from "./view";

export { createSimulation } from "./model";
export const gameDefinition: GameDefinition = {
  id: "midnight-pinball",
  title: "MIDNIGHT PINBALL",
  description: "A Malaysian island after dark. Fire the hibiscus bumpers, tour the island ramp and river orbit, then light three stars for pasar malam multiball.",
  accent: "#68ddae", controls: "flippers",
  desktopInstructions: "Z / left arrow: left flipper · / / right arrow: right flipper · hold Space, release to launch · WASD: nudge (watch tilt). Light 3 gold stars, then shoot the left ramp for multiball. Complete left ramp + right river for Island Tour bonus and multiplier. Before launch, flippers select a skill target; release at 55–75% power and hit it for 6,000. Complete market orders (6 bumpers → 3 stars → both routes) for a ×2 festival. 3 balls · 2 minutes.",
  touchInstructions: "Hold LEFT / RIGHT to flip · hold LAUNCH, release to plunge. Tap NUDGE to shift the ball (too much tilts). Light all 3 gold stars, then shoot the left ramp for multiball. Complete left ramp + right river for Island Tour bonus. Both routes pay multiball jackpots. Before launch, flippers select a skill target; release at 55–75% power and hit it for 6,000. Complete market orders (6 bumpers → 3 stars → both routes) for a ×2 festival. 3 balls · 2 minutes.",
  primaryLabel: "LEFT FLIPPER", secondaryLabel: "RIGHT FLIPPER",
  createSimulation,
  createView: (stage, simulation) => createView(stage, simulation.state as PinballState),
  hud(simulation) {
    const s = simulation.state as PinballState;
    const stars = [0, 1, 2].map(i => s.targetBits & (1 << i) ? "★" : "☆").join(" ");
    return [
      { label: "MARKET ORDER", value: marketObjective(s.market,s.tick),kind:"combo" },
      { label: "CALLED SHOT", value: `STAR ${s.skillTarget+1} · POWER ${Math.round(s.plungerCharge*100)}% · SWEET 55–75%` },
      { label: "BALL", value: `${s.ballNumber} / 3`, kind: "health" },
      { label: "MULTIPLIER", value: `×${s.multiplier}`, kind: "combo" },
      { label: s.multiball ? "MULTIBALL" : "STAR LOCK", value: s.multiball ? `${s.balls.length} BALLS · RAMP JACKPOT` : s.targetBits === 7 ? "LIT · SHOOT LEFT RAMP" : stars, kind: "combo" },
      { label: s.tilted ? "TILT" : "TABLE", value: s.tilted ? "FLIPPERS DISABLED" : s.ballSaveUntil > s.tick ? `SAVE ${Math.ceil((s.ballSaveUntil - s.tick) / 60)}s` : `${Math.round(s.tilt * 100)}% TILT`, kind: "energy" },
      { label: "ISLAND TOUR", value: `${s.tours} TOURS · ${s.tourBits & 1 ? "RAMP ✓" : "RAMP ○"} ${s.tourBits & 2 ? "RIVER ✓" : "RIVER ○"}`, kind: "combo" },
      { label: "NIGHT SHIFT", value: s.messageUntil > s.tick ? s.message : s.multiball ? "BOTH ROUTES PAY JACKPOTS" : "3 STARS → LEFT RAMP · RAMP + RIVER = TOUR" },
    ];
  },
};
export default gameDefinition;

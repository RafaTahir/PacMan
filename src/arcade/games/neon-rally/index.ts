import { MAX_TICKS, TICK_RATE, type ArcadeSimulation, type GameDefinition, type HudItem } from "../../shared/contracts";
import { DISTRICT_NAMES, comboMultiplier, createSimulation, type RallySimulation } from "./model";
import { createView } from "./view";

export { createSimulation } from "./model";

function hud(simulation: ArcadeSimulation): HudItem[] {
  const state = (simulation as RallySimulation).state;
  const seconds = Math.max(0, Math.ceil((MAX_TICKS - state.tick) / TICK_RATE));
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return [
    { label: "SPEED", value: `${Math.round(state.player.speed * 3.6)} km/h` },
    { label: "ARMOR", value: `${state.lives} ${state.lives === 1 ? "CAR" : "CARS"} · ${Math.ceil(state.player.health)}%`, kind: "health" },
    { label: "NITRO", value: `${Math.floor(state.player.nitro)}%`, kind: "energy" },
    { label: "CHAIN", value: state.combo ? `${state.combo} CLOSE · ×${comboMultiplier(state.combo)}` : "CLOSE PASSES = NITRO", kind: "combo" },
    { label: "FINISH IN", value: clock },
    { label: DISTRICT_NAMES[state.district], value: `${(state.distance / 1000).toFixed(2)} km · ${Math.min(100, Math.floor(state.tick / MAX_TICKS * 100))}%` },
  ];
}

const definition: GameDefinition = {
  id: "neon-rally",
  title: "Neon Rally",
  description: "Two minutes to own the midnight expressway. Thread traffic, bank your drifts and turn dangerous close passes into nitro.",
  accent: "#48f5df",
  controls: "drive",
  desktopInstructions: "A/D or ←/→ steer. W/↑ accelerates; S/↓ slows down. Hold primary for nitro; hold secondary while steering to drift, then release to bank it. Pass close without touching to chain points and refill nitro. Green crosses repair armor. Survive 2:00 with three cars.",
  touchInstructions: "Steer with the stick. Up accelerates; down slows down. Hold NITRO for speed. Hold DRIFT while turning, then release to bank the slide. Close passes refill nitro and grow your chain. Collect green repair crosses; survive the two-minute run.",
  primaryLabel: "NITRO",
  secondaryLabel: "DRIFT",
  createSimulation,
  createView: (stage, simulation) => createView(stage, simulation as RallySimulation),
  hud,
};

export default definition;

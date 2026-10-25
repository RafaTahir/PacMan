import { MAX_TICKS, type ArcadeSimulation, type GameDefinition } from "../../shared/contracts";
import { createSimulation, STAGE_COUNT, type ReactorState } from "./model";
import { createView } from "./view";

const definition: GameDefinition = {
  id: "reactor-breaker",
  title: "REACTOR BREAKER",
  description: "Shatter stacked reactor towers. Aim your returns, ignite chain reactions, and overcharge the core.",
  accent: "#98f4d6",
  controls: "paddle",
  desktopInstructions: "Move with A/D, ←/→, or your pointer. LAUNCH sends the ball. Strike with the paddle edge to steer. Hold PULSE, then release: the next tower hit explodes. Orange towers chain; lime towers drop upgrades. Clear all three sectors in two minutes.",
  touchInstructions: "Drag to move your paddle. Tap LAUNCH. Hold PULSE to charge an explosive hit; release to arm it. Edge hits steer the ball. Catch falling upgrades and keep one ball alive. Clear three sectors before the shift ends.",
  primaryLabel: "LAUNCH",
  secondaryLabel: "HOLD PULSE",
  createSimulation,
  createView,
  hud(simulation: ArcadeSimulation) {
    const state = simulation.state as ReactorState;
    const seconds = Math.max(0, Math.ceil((MAX_TICKS - state.tick) / 60));
    const pulse = state.pulseArmed > 0 ? state.pulseStrength === 2 ? "MEGA ARMED" : "ARMED" : state.pulseCharge > 0 ? `${Math.round(state.pulseCharge / 60 * 100)}%` : `${Math.floor(state.energy)}%`;
    return [
      { label: "SECTOR", value: `${state.stage}/${STAGE_COUNT}` },
      { label: "CORES", value: `${state.lives}`, kind: "health" },
      { label: "PULSE", value: pulse, kind: "energy" },
      { label: "COMBO", value: state.combo > 1 ? `×${1 + Math.floor(state.combo / 3)}` : "—", kind: "combo" },
      { label: "FIELD", value: state.shield ? `${state.shield} SAVE${state.shield > 1 ? "S" : ""}` : "EMPTY" },
      { label: "SHIFT", value: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` },
      { label: "STATUS", value: state.message },
    ];
  },
};

export default definition;

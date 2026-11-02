import type { GameDefinition } from "../../shared/contracts";
import { cargoCapacity, createSimulation, type OrbitState } from "./model";
import { createView } from "./view";
export { createSimulation } from "./model";
const definition: GameDefinition = {
  id: "orbit-salvage",
  title: "Orbit Salvage",
  description: "A drifting salvage ship, a field of fractured asteroids, and a refinery waiting for your haul. Bank 24 ore before the shift ends.",
  accent: "#8abaff",
  controls: "twin-stick",
  desktopInstructions:
    "WASD / arrows thrust. Mouse aims; click / Space fires. Shift holds a rechargeable shield. Break large rocks into fragments, collect gold ore, then slow down inside the central refinery to bank cargo. Full cargo starts at 12 ore. Hold SHIELD near a drifting wreck to tow it slowly into the refinery for four banked ore. Deliveries at 6/12/18 ore fit a tractor rig, twin cannon and shield refit. Dense rocks need an extra hit but drop double ore; volatile rocks crack nearby armor. Bank 24 for an early victory; bank 12 by 2:00 to finish the contract. Four hull points.",
  touchInstructions:
    "Left stick thrusts; right stick aims and fires. Hold SHIELD to absorb rocks using energy. Collect gold ore, then slow down at the central gold refinery to bank it. Bank 24 ore early or 12 by 2:00. Hold SHIELD near a wreck to tow it home. Bank 6/12/18 ore for tractor, cannon and shield upgrades. Heavy cargo slows acceleration. Let the cannon cool if it overheats.",
  primaryLabel: "FIRE",
  secondaryLabel: "SHIELD",
  createSimulation,
  createView,
  hud(sim) {
    const s = sim.state as OrbitState;
    return [
      { label: "RIG", value: `${["STARTER", "TRACTOR", "TWIN CANNON", "SHIELD REFIT"][s.rig]} · ${s.recovered} WRECKS` },
      {
        label: "RECOVERY",
        value: s.wreck
          ? `${s.wreck.towed ? "TOWING → REFINERY" : "HOLD SHIELD NEAR WRECK"} · ${Math.max(0, Math.ceil((s.wreck.expires - s.tick) / 60))}s`
          : "NEXT RIG AT 6 / 12 / 18 ORE",
      },
      { label: "HULL", value: `${s.player.hull} / 4`, kind: "health" },
      { label: "CARGO · BANKED", value: `${s.cargo}/${cargoCapacity(s)} · ${s.delivered}/24`, kind: "combo" },
      { label: "REFINED", value: `${s.delivered} / 24` },
      { label: "SHIELD", value: `${Math.ceil(s.player.shield)}%`, kind: "energy" },
      { label: s.player.overheated ? "COOLING" : "CANNON HEAT", value: `${Math.floor(s.player.heat)}%` },
      { label: `WAVE ${s.wave}`, value: s.messageUntil > s.tick ? s.message : "GOLD ORE → CENTRAL REFINERY" },
    ];
  },
};
export default definition;

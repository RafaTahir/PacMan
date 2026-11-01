import type { GameDefinition } from "../../shared/contracts";
import { FINAL_WAVE, adrenalineLevel, createSimulation, type BureauState } from "./model";
import { createView } from "./view";
export { createSimulation } from "./model";

const BOON_NAMES: Record<string, string> = { overclock: "OVERCLOCK", piercing: "PIERCING", afterimage: "AFTERIMAGE", bulwark: "BULWARK", crossfire: "CROSSFIRE" };

const definition: GameDefinition = {
  id: "hollow-bureau",
  title: "Hollow Bureau",
  description: "Hold a shifting concrete archive against the Hiss. Fire on the beat, dash through the barrage, and pick one boon between each of five waves.",
  accent: "#ff3b2f",
  controls: "twin-stick",
  desktopInstructions: "WASD / arrows move · Mouse aims · Hold click / Space fires · Shift / secondary dashes through fire. Shots that land on the red beat pulse hit twice as hard and score 1.5x. Kills without being hit build Adrenaline for faster fire and bigger scores; one hit resets it. Clear a wave, then step onto one of three boon pads. Survive five waves before 2:00.",
  touchInstructions: "Left stick moves · Right stick aims and fires · DASH slips through attacks. Fire when the red ring pulses for double damage. Clear a wave, then walk onto one of the three glowing boon pads. Survive five waves before 2:00.",
  primaryLabel: "FIRE",
  secondaryLabel: "DASH",
  createSimulation,
  createView,
  hud(simulation) {
    const s = simulation.state as BureauState, p = s.player;
    return [
      { label: "Integrity", value: `${p.hp} / ${p.maxHp}`, kind: "health" },
      { label: "Dash", value: p.dashCooldown === 0 ? "READY" : `${(p.dashCooldown / 60).toFixed(1)}s`, kind: "energy" },
      { label: "Adrenaline", value: `LV ${adrenalineLevel(s)} · ${s.combo} kills`, kind: "combo" },
      { label: s.offer ? "Choose a boon" : `Wave ${s.wave} / ${FINAL_WAVE}`, value: s.offer ? s.offer.map(b => BOON_NAMES[b]).join(" · ") : `${s.enemies.length} hostiles` },
      { label: "On-beat kills", value: `${s.beatKills}` },
      { label: "Boons", value: s.boons.length ? s.boons.map(b => BOON_NAMES[b]).join(" · ") : "None yet" },
    ];
  },
};

export default definition;

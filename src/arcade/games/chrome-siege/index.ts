import type { GameDefinition } from "../../shared/contracts";
import { BOSS_TICK, createSimulation, type SiegeState } from "./model";
import { createView } from "./view";

const definition: GameDefinition = {
  id: "chrome-siege",
  title: "Chrome Siege",
  description: "Pilot a chrome hovercraft through five neon assaults. Harvest enemy cores, evolve your cannons, and bring down the Siege Engine.",
  accent: "#43f8e4",
  controls: "twin-stick",
  desktopInstructions: "WASD / arrows move · Mouse aims · Hold click / Space fires · Shift / secondary dashes. Collect cyan cores for automatic upgrades and white repair crosses. Survive five waves, then destroy the Siege Engine before 2:00. Enemy lines show incoming shots and charges. The first six dash ticks reflect bullets. Carry gold recovery pods to the center pad for a repair and twelve seconds of support fire.",
  touchInstructions: "Left stick moves · Right stick aims and fires · DASH bursts through attacks. Collect cyan cores to upgrade and white crosses to repair. Dash into incoming shots at the start of a dash to reflect them. Carry gold pods to the center pad for support fire. Defeat the three-phase Siege Engine before 2:00.",
  primaryLabel: "FIRE",
  secondaryLabel: "DASH",
  createSimulation,
  createView,
  hud(simulation) {
    const s = simulation.state as SiegeState, p = s.player;
    const boss = s.enemies.find(enemy => enemy.kind === "boss");
    return [
      { label: "Hull", value: `${p.hp} / ${p.maxHp}`, kind: "health" },
      { label: "Dash", value: p.dashCooldown === 0 ? "READY" : `${(p.dashCooldown / 60).toFixed(1)}s`, kind: "energy" },
      { label: p.level >= 5 ? "Five-shot cannon" : p.level >= 3 ? "Triple cannon" : "Pulse cannon", value: `LV ${p.level} · ${p.xp}/${p.nextXp} cores` },
      { label: "RECOVERY", value: s.rescue ? `${s.rescue.carried ? "CARGO → CENTER" : "FIND GOLD POD"} · ${Math.max(0,Math.ceil((s.rescue.expires-s.tick)/60))}s` : `${s.rescued} RECOVERED` },
      { label: "SUPPORT", value: s.supportTicks ? `${Math.ceil(s.supportTicks/60)}s · AUTO FIRE` : `${s.parries} DASH PARRIES`, kind: "energy" },
      { label: "MISSION", value: s.messageUntil>s.tick?s.message:"RECOVER · REFLECT · BREAK THE SIEGE" },
      { label: "Combo", value: `${s.combo} · ×${Math.min(5, 1 + Math.floor(s.combo / 5))}`, kind: "combo" },
      { label: boss ? `Siege Engine · phase ${boss.phase}` : s.bossDefeated ? "Siege broken" : `Wave ${s.wave} / 5`, value: boss ? `${Math.ceil(boss.hp / boss.maxHp * 100)}%` : s.bossDefeated ? "VICTORY" : `Boss in ${Math.max(0, Math.ceil((BOSS_TICK - s.tick) / 60))}s` },
    ];
  },
};

export default definition;

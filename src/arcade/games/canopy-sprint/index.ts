import type { GameDefinition } from '../../shared/contracts';
import { createSimulation, type CanopyState } from './model';
import { createView } from './view';
export { createSimulation } from './model';
const game: GameDefinition = {
 id: 'canopy-sprint', title: 'CANOPY SPRINT', accent: '#90ef8c', controls: 'drive',
 description: 'A moonlit dash through a Malaysian rainforest canopy. Read the trail, follow the orchids, and bring the night home.',
 desktopInstructions: 'A/D or ←/→ switch lanes. Space jumps logs and gaps. Shift slides under bamboo arches. Dodge solid crates. Orchid chains multiply points. Three hearts · survive two minutes.',
 touchInstructions: 'Move the stick left/right to change lanes. Tap JUMP over logs and gaps; tap SLIDE under arches. Dodge crates and collect orchids for a growing multiplier. Three hearts · two minutes.',
 primaryLabel: 'JUMP', secondaryLabel: 'SLIDE', createSimulation,
 createView: (stage, simulation) => createView(stage, simulation.state as CanopyState),
 hud(simulation) {
  const s = simulation.state as CanopyState;
  return [{ label: 'HEARTS', value: `${s.hearts} / 3`, kind: 'health' }, { label: 'TRAIL', value: `${Math.floor(s.distance)} m` },
   { label: 'ORCHIDS', value: String(s.orchids) }, { label: 'CHAIN', value: `${s.chain} · ×${1 + Math.min(4, Math.floor(s.chain / 5))}`, kind: 'combo' },
   { label: 'CANOPY', value: s.messageUntil > s.tick ? s.message : 'JUMP LOGS · SLIDE ARCHES · DODGE CRATES' }];
 },
};
export default game;

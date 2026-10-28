import { MAX_TICKS, type GameDefinition } from '../../shared/contracts';
import { createSimulation, type StackState } from './model';
import { createView } from './view';
const definition:GameDefinition={
 id:'skybound-stack',title:'SKYBOUND STACK',description:'Build a luminous skyline with a mix of three-, four- and five-cell pieces. Clear full horizontal rows, link clears and keep the skyline below the ceiling.',accent:'#bca1ff',controls:'drive',
 desktopInstructions:'A/D or ←/→ move. S/↓ soft drops. Tap Space to rotate; Shift drops instantly onto the white landing outline. Fill horizontal rows to clear them. Consecutive clearing pieces earn chain bonuses. Speed increases every four rows. Two-minute shift; reaching the ceiling ends your run.',
 touchInstructions:'Stick left/right moves; down soft drops. Tap ROTATE to turn the piece; DROP lands it instantly on the white outline. Clear full horizontal rows. Chain clearing pieces for bonuses; keep the skyline below the ceiling for the two-minute shift.',
 primaryLabel:'ROTATE',secondaryLabel:'DROP',createSimulation,createView:(stage,sim)=>createView(stage,sim.state as StackState),
 hud(sim){const s=sim.state as StackState;return[{label:'ROWS / LEVEL',value:`${s.rows} / ${s.level}`,kind:'energy'},{label:'NEXT',value:['BAR','HOOK','SQUARE','CROWN','STAIRS','CROSS'][s.next],kind:'health'},{label:'CHAIN',value:s.combo?`×${s.combo}`:'—',kind:'combo'},{label:'PIECES',value:String(s.pieces)},{label:'SHIFT',value:`${Math.ceil((MAX_TICKS-s.tick)/60)}s`},{label:'SKYLINE',value:s.message}];}
};export default definition;

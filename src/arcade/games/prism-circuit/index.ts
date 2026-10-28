import { MAX_TICKS, type GameDefinition } from '../../shared/contracts';
import { createSimulation, type CircuitState } from './model';
import { createView } from './view';
const definition:GameDefinition={
  id:'prism-circuit',title:'PRISM CIRCUIT',description:'Restore the midnight transmission. Rotate conductive prisms into an unbroken route from the left source to the right receiver. No lives lost for experimentation.',accent:'#8bfff0',controls:'drive',
  desktopInstructions:'Arrows / WASD select a tile. Tap Space to rotate clockwise; Shift undoes one rotation. Connect the source at top left to the receiver at bottom right. Brighter pipes show the live path. Complete as many circuits as possible in two minutes; fewer rotations earn more points.',
  touchInstructions:'Use the stick to select a tile. Tap ROTATE to turn it clockwise; UNDO reverses your last rotation. Connect the top-left source to the bottom-right receiver. Complete circuits in two minutes; mistakes cost no lives.',
  primaryLabel:'ROTATE',secondaryLabel:'UNDO',createSimulation,createView:(stage,sim)=>createView(stage,sim.state as CircuitState),
  hud(sim){const s=sim.state as CircuitState;return[{label:'CIRCUITS',value:String(s.boards),kind:'combo'},{label:'LIVE PATH',value:`${s.powered.length} TILES`,kind:'energy'},{label:'ROTATIONS',value:String(s.boardMoves),kind:'health'},{label:'GRID',value:`${s.size} × ${s.size}`},{label:'TIME',value:`${Math.ceil((MAX_TICKS-s.tick)/60)}s`},{label:'TRANSMISSION',value:s.message}];}
};export default definition;

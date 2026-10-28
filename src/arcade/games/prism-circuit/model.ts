import { Buttons, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from '../../shared/contracts';
import { seededRandom } from '../../shared/math';
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export interface CircuitTile { mask: number; rotation: number }
export interface CircuitState extends ArcadeState {
  size: number; tiles: CircuitTile[]; powered: number[]; selected: number; boards: number; moves: number; boardMoves: number;
  flash: number; connected: boolean; transition: number; history: { index: number; rotation: number }[]; message: string;
}
export const rotatedMask = (tile: CircuitTile) => ((tile.mask << tile.rotation) | (tile.mask >> (4 - tile.rotation))) & 15;
export function traceCircuit(size: number, tiles: CircuitTile[]): { powered: number[]; connected: boolean } {
  const powered: number[] = []; let index = 0, entry = 3;
  while (powered.length < size * size) {
    const tile = tiles[index], mask = rotatedMask(tile);
    if (!(mask & (1 << entry))) break;
    powered.push(index);
    const exit = [0,1,2,3].find(d => d !== entry && !!(mask & (1 << d)));
    if (exit === undefined) break;
    if (index === size * size - 1 && exit === 1) return { powered, connected: true };
    const x = index % size + DX[exit], y = Math.floor(index / size) + DY[exit];
    if (x < 0 || y < 0 || x >= size || y >= size) break;
    index = y * size + x; entry = (exit + 2) % 4;
    if (powered.includes(index)) break;
  }
  return { powered, connected: false };
}
export function createSimulation(seed: number): ArcadeSimulation<CircuitState> {
  const random = seededRandom(seed); let buttons = 0, moveDirection = -1, repeat = 0;
  const state: CircuitState = { seed, tick: 0, score: 0, status: 'playing', size: 3, tiles: [], powered: [], selected: 0, boards: 0,
    moves: 0, boardMoves: 0, flash: 0, connected: false, transition: 0, history: [], message: 'Connect the left source to the right receiver.' };
  function generate() {
    const n = state.size = Math.min(5, 3 + Math.floor(state.boards / 2));
    const path: number[] = [0], visited = new Set([0]);
    function search(index: number): boolean {
      if (index === n * n - 1) return true;
      const directions = [0,1,2,3].map(d => ({d, key: random()})).sort((a,b) => a.key-b.key);
      for (const {d} of directions) {
        const x=index%n+DX[d],y=Math.floor(index/n)+DY[d],next=y*n+x;
        if (x<0||y<0||x>=n||y>=n||visited.has(next)) continue;
        visited.add(next);path.push(next);if(search(next))return true;path.pop();visited.delete(next);
      }
      return false;
    }
    search(0);
    state.tiles = Array.from({length:n*n},()=>({ mask: random()<0.5 ? 5 : 3, rotation: Math.floor(random()*4) }));
    path.forEach((index,i)=>{
      const direction=(other:number)=> other===index-n?0:other===index+1?1:other===index+n?2:3;
      const entry=i===0?3:direction(path[i-1]),exit=i===path.length-1?1:direction(path[i+1]);
      state.tiles[index]={mask:(1<<entry)|(1<<exit),rotation:Math.floor(random()*4)};
    });
    // Start with a visible disconnect, never award an automatically solved puzzle.
    if(traceCircuit(n,state.tiles).connected) state.tiles[0].rotation=(state.tiles[0].rotation+1)%4;
    state.selected=0;state.boardMoves=0;state.history=[];state.connected=false;state.powered=traceCircuit(n,state.tiles).powered;
    state.message='Connect SOURCE → RECEIVER. Rotate a tile; undo is free.';
  }
  generate();
  return { state, step(input: Readonly<ArcadeInput>) {
    if(state.status!=='playing')return[];
    state.tick++;const signals:GameSignal[]=[];if(state.flash>0)state.flash--;
    if(state.transition>0){state.transition--;if(!state.transition)generate();buttons=input.buttons;}
    else {
      const direction=Math.abs(input.x)>Math.abs(input.y)?(input.x>45?1:input.x< -45?3:-1):(input.y>45?2:input.y< -45?0:-1);
      if(direction!==moveDirection){repeat=0;moveDirection=direction;}
      if(direction>=0 && (repeat===0 || repeat>=18 && (repeat-18)%6===0)){
        const x=state.selected%state.size+DX[direction],y=Math.floor(state.selected/state.size)+DY[direction];
        if(x>=0&&y>=0&&x<state.size&&y<state.size)state.selected=y*state.size+x;
      }
      if(direction>=0)repeat++;else repeat=0;
      const pressed=input.buttons&~buttons;buttons=input.buttons;
      if(pressed&Buttons.SECONDARY){const previous=state.history.pop();if(previous){state.tiles[previous.index].rotation=previous.rotation;state.selected=previous.index;signals.push({type:'bounce'});}}
      else if(pressed&Buttons.PRIMARY){
        const tile=state.tiles[state.selected];state.history.push({index:state.selected,rotation:tile.rotation});if(state.history.length>256)state.history.shift();
        tile.rotation=(tile.rotation+1)%4;state.moves++;state.boardMoves++;signals.push({type:'bounce'});
      }
      const result=traceCircuit(state.size,state.tiles);state.powered=result.powered;state.connected=result.connected;
      if(result.connected){state.boards++;state.score+=Math.max(200,1500+state.size*150-state.boardMoves*20);state.flash=60;state.transition=75;state.message='CIRCUIT COMPLETE · next transmission incoming';signals.push({type:'chain'});}
    }
    if(state.tick>=MAX_TICKS){state.status=state.boards>0?'victory':'gameover';signals.push({type:state.boards>0?'win':'lose'});}
    return signals;
  }};
}

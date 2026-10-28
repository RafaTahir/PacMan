import { Buttons, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from '../../shared/contracts';
import { seededRandom } from '../../shared/math';
export const WIDTH=8,HEIGHT=14;
/** Skyfall mix: original implementation with three-, four- and five-cell shapes. */
export const SHAPES:readonly (readonly [number,number][])[]=[[[0,1],[1,1],[2,1]],[[0,0],[0,1],[1,1],[2,1]],[[0,0],[1,0],[0,1],[1,1]],[[1,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[0,1],[1,1]],[[1,0],[0,1],[1,1],[2,1],[1,2]]];
export interface StackPiece{kind:number;x:number;y:number;rotation:number}
export interface StackState extends ArcadeState{
 board:number[];piece:StackPiece;next:number;rows:number;level:number;combo:number;pieces:number;ghostY:number;clearFlash:number;clearedRows:number[];message:string;
}
export function cells(piece:StackPiece):[number,number][]{return SHAPES[piece.kind].map(([sx,sy])=>{let x=sx,y=sy;if(piece.kind!==2)for(let i=0;i<piece.rotation;i++){const nx=2-y;y=x;x=nx;}return[x+piece.x,y+piece.y];});}
export function fits(board:readonly number[],piece:StackPiece):boolean{return cells(piece).every(([x,y])=>x>=0&&x<WIDTH&&y<HEIGHT&&(y<0||!board[y*WIDTH+x]));}
export function ghostRow(board:readonly number[],piece:StackPiece):number{let y=piece.y;while(fits(board,{...piece,y:y+1}))y++;return y;}
export function clearRows(board:number[]):number[]{const full:number[]=[];for(let y=0;y<HEIGHT;y++)if(board.slice(y*WIDTH,(y+1)*WIDTH).every(v=>v>0))full.push(y);for(const y of full){board.splice(y*WIDTH,WIDTH);board.unshift(...Array(WIDTH).fill(0));}return full;}
export function createSimulation(seed:number):ArcadeSimulation<StackState>{
 const random=seededRandom(seed);let bag:number[]=[],buttons=0,horizontal=0,held=0,fall=0,lock=0,lockResets=0;
 function draw(){if(!bag.length){bag=[0,1,2,3,4,5];for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}}return bag.pop()!;}
 const state:StackState={seed,tick:0,score:0,status:'playing',board:Array(WIDTH*HEIGHT).fill(0),piece:{kind:draw(),x:2,y:-1,rotation:0},next:draw(),rows:0,level:1,combo:0,pieces:0,ghostY:0,clearFlash:0,clearedRows:[],message:'Fill horizontal rows. The outline shows your landing.'};
 function spawn(){state.piece={kind:state.next,x:2,y:-1,rotation:0};state.next=draw();fall=lock=lockResets=0;if(!fits(state.board,state.piece)){state.status='gameover';state.message='SKYLINE FULL · another round?';}}
 function land(signals:GameSignal[]){
  const occupied=cells(state.piece);if(occupied.some(([,y])=>y<0)){state.status='gameover';state.message='SKYLINE FULL';signals.push({type:'lose'});return;}
  occupied.forEach(([x,y])=>state.board[y*WIDTH+x]=state.piece.kind+1);state.pieces++;
  const rows=clearRows(state.board);state.clearedRows=rows;
  if(rows.length){state.rows+=rows.length;state.combo++;state.score+=100*rows.length*rows.length*state.level+50*(state.combo-1);state.level=1+Math.floor(state.rows/4);state.clearFlash=18;state.message=`${rows.length} ROW${rows.length>1?'S':''} CLEAR · CHAIN ${state.combo}`;signals.push({type:'chain'});}
  else{state.combo=0;state.message='Build your next clean line.';signals.push({type:'bounce'});}
  spawn();
 }
 state.ghostY=ghostRow(state.board,state.piece);
 return{state,step(input:Readonly<ArcadeInput>){
  if(state.status!=='playing')return[];state.tick++;const signals:GameSignal[]=[];
  const pressed=input.buttons&~buttons;buttons=input.buttons;
  if(state.clearFlash>0)state.clearFlash--;
  else{
   const direction=input.x>40?1:input.x< -40?-1:0;if(direction!==horizontal){horizontal=direction;held=0;}
   let moved=false;
   if(direction&&(held===0||held>=12&&(held-12)%4===0)){
    const candidate={...state.piece,x:state.piece.x+direction};if(fits(state.board,candidate)){state.piece=candidate;moved=true;}
   }
   if(direction)held++;else held=0;
   if(pressed&Buttons.PRIMARY){
    const rotation=(state.piece.rotation+1)%4;
    for(const kick of[0,-1,1,-2,2]){const candidate={...state.piece,x:state.piece.x+kick,rotation};if(fits(state.board,candidate)){state.piece=candidate;moved=true;signals.push({type:'bounce'});break;}}
   }
   if(moved&&lockResets<8){lock=0;lockResets++;}
   if(pressed&Buttons.SECONDARY){const y=ghostRow(state.board,state.piece);state.score+=(y-state.piece.y)*2;state.piece.y=y;land(signals);}
   else{
    fall++;const interval=input.y>40?3:Math.max(8,44-(state.level-1)*5);
    if(fall>=interval){fall=0;const candidate={...state.piece,y:state.piece.y+1};if(fits(state.board,candidate)){state.piece=candidate;if(input.y>40)state.score++;}}
    if(!fits(state.board,{...state.piece,y:state.piece.y+1})){lock++;if(lock>=24)land(signals);}else lock=0;
   }
  }
  state.ghostY=ghostRow(state.board,state.piece);
  if(state.tick>=MAX_TICKS&&state.status==='playing'){state.status=state.rows>0?'victory':'gameover';state.message='SHIFT COMPLETE';signals.push({type:state.rows>0?'win':'lose'});}
  return signals;
 }};
}

import { Buttons, DT, MAX_TICKS, type ArcadeInput, type ArcadeSimulation, type ArcadeState, type GameSignal } from '../../shared/contracts';
import { clamp, seededRandom } from '../../shared/math';
export const DOCKS=[{x:-10,y:7,name:'PENANG'},{x:-10,y:-7,name:'LANGKAWI'},{x:0,y:-8,name:'REDANG'},{x:10,y:-7,name:'TIOMAN'},{x:10,y:7,name:'MERSING'},{x:0,y:8,name:'MELAKA'}] as const;
export const ISLANDS=[{x:-5,y:-2,radius:1.65},{x:4.8,y:1.8,radius:1.85},{x:-1,y:2.7,radius:1.1},{x:2.1,y:-4,radius:1.0}] as const;
export const REEFS=[{x:-7,y:2.2,radius:.55},{x:7.3,y:-2.5,radius:.6},{x:-2.8,y:-5.7,radius:.5},{x:4.3,y:6.2,radius:.6}] as const;
export interface Ferry { x:number;y:number;vx:number;vy:number }
export interface TidalState extends ArcadeState { player:{x:number;y:number;vx:number;vy:number;angle:number;hull:number;invincible:number;fuel:number}; pickup:number;destination:number;cargo:boolean;deliveries:number;contractStarted:number;dockProgress:number;combo:number;ferries:Ferry[];hitSerial:number;message:string;messageUntil:number;current:{x:number;y:number};distance:number; }
export function createSimulation(seed:number):ArcadeSimulation<TidalState>{
 const random=seededRandom(seed);let collisionCooldown=0;
 const state:TidalState={seed,tick:0,score:0,status:'playing',player:{x:-10,y:7,vx:0,vy:0,angle:0,hull:5,invincible:0,fuel:100},pickup:0,destination:1+Math.floor(random()*5),cargo:false,deliveries:0,contractStarted:0,dockProgress:0,combo:0,ferries:[{x:-12,y:-4,vx:2.1,vy:0},{x:12,y:4,vx:-1.8,vy:0},{x:6,y:-9,vx:0,vy:1.35}],hitSerial:0,message:'SLOW DOWN IN THE GOLD DOCK TO LOAD CARGO',messageUntil:300,current:{x:0,y:0},distance:0};
 const chooseRoute=(avoid:number)=>{let n=Math.floor(random()*5);if(n>=avoid)n++;return n;};
 return{state,step(input:Readonly<ArcadeInput>){
  if(state.status!=='playing')return[];state.tick++;const events:GameSignal[]=[],p=state.player;
  if(collisionCooldown>0)collisionCooldown--;if(p.invincible>0)p.invincible--;
  const tide=Math.floor(state.tick/1200)%4;state.current.x=[.35,-.25,-.4,.2][tide];state.current.y=[.12,.3,-.15,-.3][tide];
  const boosted=Boolean(input.buttons&Buttons.PRIMARY)&&p.fuel>1&&Math.hypot(input.x,input.y)>15,brake=Boolean(input.buttons&Buttons.SECONDARY),length=Math.max(127,Math.hypot(input.x,input.y)),power=boosted?12:7;
  p.fuel=clamp(p.fuel+(boosted?-25:13)*DT,0,100);
  p.vx=(p.vx+input.x/length*power*DT+state.current.x*DT)*(brake?.90:.983);p.vy=(p.vy+input.y/length*power*DT+state.current.y*DT)*(brake?.90:.983);
  const maxSpeed=boosted?7.4:4.8,speed=Math.hypot(p.vx,p.vy);if(speed>maxSpeed){p.vx*=maxSpeed/speed;p.vy*=maxSpeed/speed;}
  if(Math.hypot(p.vx,p.vy)>.2)p.angle=Math.atan2(p.vy,p.vx)+Math.PI/2;
  state.distance+=Math.hypot(p.vx,p.vy)*DT;
  for(const f of state.ferries){f.x+=f.vx*DT;f.y+=f.vy*DT;if(Math.abs(f.x)>12.3){f.x=clamp(f.x,-12.3,12.3);f.vx*=-1;}if(Math.abs(f.y)>9.3){f.y=clamp(f.y,-9.3,9.3);f.vy*=-1;}}
  let collided=false;
  // Four deterministic substeps resolve fast powered approaches to reef/island capsules.
  for(let k=0;k<4;k++){
   p.x+=p.vx*DT/4;p.y+=p.vy*DT/4;
   if(Math.abs(p.x)>12.6){p.x=clamp(p.x,-12.6,12.6);p.vx*=-.5;collided=true;}if(Math.abs(p.y)>9.5){p.y=clamp(p.y,-9.5,9.5);p.vy*=-.5;collided=true;}
   const obstacles=[...ISLANDS,...REEFS,...state.ferries.map(f=>({...f,radius:.65}))];
   for(const o of obstacles){const dx=p.x-o.x,dy=p.y-o.y,d=Math.hypot(dx,dy),radius=o.radius+.32;if(d<radius){const nx=d>.0001?dx/d:1,ny=d>.0001?dy/d:0;p.x=o.x+nx*(radius+.005);p.y=o.y+ny*(radius+.005);const into=p.vx*nx+p.vy*ny;if(into<0){p.vx-=into*1.6*nx;p.vy-=into*1.6*ny;}if(speed>1.7)collided=true;}}
  }
  if(collided&&!collisionCooldown){collisionCooldown=75;p.hull--;p.invincible=75;state.combo=0;state.hitSerial++;state.score=Math.max(0,state.score-50);state.message='WATCH THE REEFS · BRAKE BEFORE DOCKING';state.messageUntil=state.tick+120;events.push({type:'hit'});}
  const dock=DOCKS[state.cargo?state.destination:state.pickup],distance=Math.hypot(p.x-dock.x,p.y-dock.y);
  if(distance<1.05&&Math.hypot(p.vx,p.vy)<2.0){state.dockProgress++;
   if(state.dockProgress>=45){state.dockProgress=0;
    if(!state.cargo){state.cargo=true;state.contractStarted=state.tick;state.message=`CARGO ABOARD → ${DOCKS[state.destination].name}`;state.messageUntil=state.tick+180;events.push({type:'upgrade'});}
    else{const elapsed=state.tick-state.contractStarted;state.deliveries++;state.combo++;state.score+=500+Math.max(0,600-Math.floor(elapsed/3))+Math.min(5,state.combo)*100;state.cargo=false;state.pickup=state.destination;state.destination=chooseRoute(state.pickup);p.hull=Math.min(5,p.hull+1);p.fuel=100;state.message='DELIVERED · HULL REPAIRED · NEXT CARGO READY';state.messageUntil=state.tick+180;events.push({type:'chain',value:state.combo});}
   }
  }else state.dockProgress=0;
  if(p.hull<=0){state.status='gameover';events.push({type:'lose'});}else if(state.deliveries>=8){state.status='victory';state.score+=Math.max(0,MAX_TICKS-state.tick);events.push({type:'win'});}else if(state.tick>=MAX_TICKS){state.status=state.deliveries>=4?'victory':'gameover';events.push({type:state.status==='victory'?'win':'lose'});}
  return events;
 }};
}

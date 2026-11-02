/** Authored pinball mode ladder; contacts come only from the physical model. */
export interface MarketMode { step:number; progress:number; deadline:number; festivals:number; festivalUntil:number }
export const createMarket = ():MarketMode=>({step:0,progress:0,deadline:0,festivals:0,festivalUntil:0});
export function marketContact(m:MarketMode,kind:'bumper'|'target'|'ramp'|'river',index:number,tick:number):number {
  if(m.festivalUntil>tick)return 0;
  if(m.deadline && tick>m.deadline){m.step=0;m.progress=0;m.deadline=0;}
  if(!m.deadline)m.deadline=tick+1800;
  if(m.step===0&&kind==='bumper')m.progress++;
  if(m.step===1&&kind==='target')m.progress|=1<<index;
  if(m.step===2&&(kind==='ramp'||kind==='river'))m.progress|=kind==='ramp'?1:2;
  const done=m.step===0?m.progress>=6:m.step===1?m.progress===7:m.progress===3;
  if(!done)return 0;
  const reward=[500,1000,5000][m.step];m.step++;m.progress=0;m.deadline=tick+1800;
  if(m.step===3){m.festivals++;m.festivalUntil=tick+720;m.step=0;m.deadline=0;}
  return reward;
}
export function marketObjective(m:MarketMode,tick:number):string {
  if(m.festivalUntil>tick)return `FESTIVAL ×2 · ${Math.ceil((m.festivalUntil-tick)/60)}s`;
  const goal=m.step===0?`BUMPERS ${m.progress}/6`:m.step===1?`STARS ${[0,1,2].filter(i=>m.progress&(1<<i)).length}/3`:`ROUTES ${m.progress&1?'RAMP ✓':'RAMP ○'} ${m.progress&2?'RIVER ✓':'RIVER ○'}`;
  return `${goal}${m.deadline?` · ${Math.max(0,Math.ceil((m.deadline-tick)/60))}s`:''}`;
}

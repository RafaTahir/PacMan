import { describe, it, expect } from 'vitest';
import { Buttons, MAX_TICKS, NEUTRAL_INPUT } from '../src/arcade/shared/contracts';
import { createSimulation, type TrailKind } from '../src/arcade/games/canopy-sprint/model';
const input={...NEUTRAL_INPUT};
const hazard=(kind:TrailKind,lane=1)=>({id:500,lane,distance:0.65,previousDistance:0.65,kind,resolved:false});
describe('Canopy Sprint trail mechanics',()=>{
 it('replays deterministically, with bounded objects and finite state',()=>{
  const a=createSimulation(812),b=createSimulation(812);
  for(let t=0;t<MAX_TICKS;t++) {const i={...input,x:t%170<85?127:-127,buttons:t%63===0?Buttons.PRIMARY:t%89===0?Buttons.SECONDARY:0};expect(a.step(i)).toEqual(b.step(i));if(t%300===0){expect(a.state).toEqual(b.state);expect(a.state.objects.length).toBeLessThan(64);}}
  expect(a.state).toEqual(b.state);expect(Number.isFinite(a.state.score)).toBe(true);
 });
 it('steers one lane per press and respects the trail boundaries',()=>{
  const g=createSimulation(1);g.step({...input,x:127});for(let t=0;t<8;t++)g.step(input);expect(g.state.lane).toBe(2);expect(g.state.x).toBe(2.2);
  g.step({...input,x:127});expect(g.state.lane).toBe(2);g.step(input);g.step({...input,x:-127});expect(g.state.lane).toBe(1);
 });
 it('jumps and lands; holding jump does not repeatedly fly',()=>{
  const g=createSimulation(2);for(let t=0;t<90;t++)g.step({...input,buttons:Buttons.PRIMARY});expect(g.state.height).toBe(0);expect(g.state.verticalSpeed).toBe(0);
  g.step(input);g.step({...input,buttons:Buttons.PRIMARY});expect(g.state.height).toBeGreaterThan(0);
 });
 it('uses different responses for logs, low gates and solid crates',()=>{
  const g=createSimulation(3);g.state.height=1;g.state.objects.push(hazard('log'));g.step(input);expect(g.state.hearts).toBe(3);expect(g.state.obstaclesCleared).toBe(1);
  g.state.height=0;g.state.verticalSpeed=0;g.state.slideTicks=10;g.state.objects.push(hazard('gate'));g.step(input);expect(g.state.hearts).toBe(3);
  g.state.objects.push(hazard('crate'));g.step(input);expect(g.state.hearts).toBe(2);
 });
 it('collects orchids into chains and collision breaks the chain',()=>{
  const g=createSimulation(4);for(let t=0;t<5;t++){g.state.objects.push(hazard('orchid'));g.step(input);}expect(g.state.orchids).toBe(5);expect(g.state.chain).toBe(5);expect(g.state.score).toBe(150);
  g.state.objects.push(hazard('log'));g.step(input);expect(g.state.chain).toBe(0);expect(g.state.hearts).toBe(2);
 });
 it('grants collision immunity and ends on the third unprotected hit',()=>{
  const g=createSimulation(5);for(let n=0;n<3;n++){g.state.invincible=0;g.state.objects.push(hazard('crate'));g.step(input);if(n===0){g.state.objects.push(hazard('crate'));g.step(input);expect(g.state.hearts).toBe(2);}}
  expect(g.state.status).toBe('gameover');const t=g.state.tick;g.step(input);expect(g.state.tick).toBe(t);
 });
 it('finishes a surviving two-minute run and freezes terminal state',()=>{
  const g=createSimulation(7);for(let t=0;t<MAX_TICKS;t++){g.state.invincible=2;g.step(input);}expect(g.state.status).toBe('victory');expect(g.state.tick).toBe(MAX_TICKS);const score=g.state.score;g.step(input);expect(g.state.score).toBe(score);
 });
 it('allows a route-reading player to complete full runs without artificial immunity',()=>{
  for(const seed of [1,7,53,1024,41801]) {
   const g=createSimulation(seed);
   for(let t=0;t<MAX_TICKS && g.state.status==='playing';t++) {
    const hazards=g.state.objects.filter(o=>o.kind!=='orchid'&&!o.resolved&&o.distance>0.55&&o.distance<g.state.speed*1.1).sort((a,b)=>a.distance-b.distance);
    const upcoming=hazards.filter(o=>o.distance<=(hazards[0]?.distance??0)+0.5);
    let target=g.state.lane;
    if(upcoming.some(o=>o.lane===target)) {
     const candidates=[0,1,2].filter(lane=>!upcoming.some(o=>o.lane===lane));
     if(candidates.length) target=candidates.sort((a,b)=>Math.abs(a-g.state.lane)-Math.abs(b-g.state.lane))[0];
    }
    g.step({...input,x:Math.sign(target-g.state.lane)*127});
   }
   expect(g.state.status,`seed ${seed} should have a readable route`).toBe('victory');
   expect(g.state.distance).toBeGreaterThan(1700);
  }
 });
 it('generates at most two hazards per row and always leaves a route',()=>{
  const g=createSimulation(512);for(let t=0;t<MAX_TICKS;t++){g.state.invincible=2;g.step(input);const hazards=g.state.objects.filter(o=>o.kind!=='orchid'&&o.distance>39);expect(hazards.length).toBeLessThan(3);}
 });
});

import {describe,it,expect} from 'vitest';
import {createMarket,marketContact,marketObjective} from '../src/arcade/games/midnight-pinball/market';
describe('Night market objective ladder',()=>{
  it('requires six bumpers, three distinct stars and both routes, then opens a bounded festival',()=>{
    const m=createMarket();let reward=0;
    for(let i=0;i<6;i++)reward+=marketContact(m,'bumper',0,i+1);
    expect(m.step).toBe(1);expect(reward).toBe(500);
    for(let i=0;i<3;i++)reward+=marketContact(m,'target',0,10+i);
    expect(m.step).toBe(1);
    reward+=marketContact(m,'target',1,20);reward+=marketContact(m,'target',2,21);
    expect(m.step).toBe(2);
    reward+=marketContact(m,'ramp',0,30);reward+=marketContact(m,'ramp',0,31);expect(m.step).toBe(2);
    reward+=marketContact(m,'river',0,32);expect(reward).toBe(6500);expect(m.festivals).toBe(1);expect(m.festivalUntil).toBe(752);
    expect(marketContact(m,'bumper',0,40)).toBe(0);expect(marketObjective(m,40)).toContain('FESTIVAL');
    marketContact(m,'bumper',0,752);expect(m.progress).toBe(1);
  });
  it('expires progress and restarts with the first order',()=>{
    const m=createMarket();for(let i=0;i<6;i++)marketContact(m,'bumper',0,i+1);
    marketContact(m,'target',0,2000);expect(m.step).toBe(0);expect(m.progress).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { Game } from "../src/engine";
import { advanceRelay, createRelay, RELAY_BEACONS } from "../src/relay";
import { TICK_SECONDS } from "../src/levels";
import { isWalkable } from "../src/maze";

describe("Circuit Relay", () => {
  it("uses reachable numbered targets and awards exactly one ward after four distinct legs", () => {
    const r = createRelay(5); let points = 0;
    expect(r.target).toBe(1);
    for (let i = 0; i < 4; i++) {
      const b = RELAY_BEACONS[r.target]; expect(isWalkable(b.x,b.y,'pacman')).toBe(true);
      points += advanceRelay(r,b.x,b.y,false,100+i*800);
      expect(advanceRelay(r,b.x,b.y,false,101+i*800)).toBe(0);
    }
    expect(points).toBe(2100); expect(r.ward).toBe(true); expect(r.circuits).toBe(1);
  });
  it("expires a leg only after its deadline and resets its reward tier", () => {
    const r=createRelay(0); advanceRelay(r,6,5,false,100);
    advanceRelay(r,-1,-1,false,1000); expect(r.collected).toBe(1);
    expect(advanceRelay(r,21,5,false,1001)).toBe(150); expect(r.collected).toBe(1);
  });
  it("caps flow rewards and breaks the chain after a gap without rewarding idle visits", () => {
    const r=createRelay(0); let score=0;
    for(let i=1;i<=100;i++) score+=advanceRelay(r,-1,-1,true,i);
    expect(score).toBe(1400);
    expect(advanceRelay(r,-1,-1,false,250)).toBe(0); expect(r.streak).toBe(100);
    advanceRelay(r,-1,-1,false,251); expect(r.streak).toBe(0);
  });
  it("freezes relay clocks on pause and restarts with the same seeded route", () => {
    const g=new Game({seed:13,relay:true});g.start();g.update(123*TICK_SECONDS);
    const r=structuredClone(g.state.relay);g.togglePause();g.update(99);expect(g.state.relay).toEqual(r);
    g.restart();expect(g.state.relay).toEqual(createRelay(13));
  });
  it("absorbs one collision, grants a brief escape window and then permits damage", () => {
    const g=new Game({seed:1,relay:true});g.start();g.update(123*TICK_SECONDS);
    function encounter(){g.state.pacman={x:1,y:1,dir:'up',nextDir:'up',moving:true};g.state.ghosts[0]={id:'blinky',x:1,y:1,dir:'up',mode:'normal',moving:true,target:{x:1,y:1}};g.update(TICK_SECONDS);}
    g.state.relay!.ward=true;encounter();expect(g.state.lives).toBe(3);expect(g.state.relay!.ward).toBe(false);
    encounter();expect(g.state.lives).toBe(3);
    g.state.relay!.graceUntil=0;encounter();expect(g.state.lives).toBe(2);
  });
});

describe("relay time during automatic holds", () => {
  function activeGame() {
    const game = new Game({ seed: 1, relay: true });
    game.start(); game.update(123 * TICK_SECONDS);
    expect(game.state.phase).toBe("playing");
    return game;
  }
  function armTimers(game: Game) {
    Object.assign(game.state.relay!, { collected: 3, streak: 19, deadline: game.state.frame + 100,
      lastDot: game.state.frame, messageUntil: game.state.frame + 20, graceUntil: game.state.frame + 30 });
  }
  function remaining(game: Game) {
    const r = game.state.relay!, frame = game.state.frame;
    return { deadline: r.deadline - frame, dotAge: frame - r.lastDot,
      message: r.messageUntil - frame, grace: r.graceUntil - frame };
  }
  it("preserves a nearly completed circuit through level-clear and ready, then resumes ordinary time", () => {
    const game = activeGame(); armTimers(game);
    game.state.phase = "level-clear"; game.state.phaseTime = 0;
    const before = remaining(game);
    let ticks = 0;
    while (String(game.state.phase) !== "playing" && ticks++ < 400) game.update(TICK_SECONDS);
    expect(game.state.phase).toBe("playing");
    expect(ticks).toBeGreaterThan(200);
    expect(remaining(game)).toEqual(before);
    expect(game.state.relay!.collected).toBe(3);
    game.update(TICK_SECONDS);
    expect(game.state.relay!.deadline - game.state.frame).toBe(99);
    expect(game.state.relay!.collected).toBe(3);
  });
  it("preserves timers through a real frightened-ghost score hold and never revives expired protection", () => {
    const game = activeGame();
    game.state.pacman = { x: 1, y: 1, dir: "up", nextDir: "up", moving: true };
    game.state.ghosts[0] = { id: "blinky", x: 1, y: 1, dir: "up", mode: "frightened", moving: true, target: { x: 1, y: 1 } };
    game.update(TICK_SECONDS);
    expect(game.state.ghosts[0].mode).toBe("eyes");
    armTimers(game);
    game.state.relay!.graceUntil = game.state.frame - 1;
    const grace = game.state.relay!.graceUntil;
    const before = remaining(game);
    game.update(60 * TICK_SECONDS);
    expect(remaining(game)).toMatchObject({ deadline: before.deadline, dotAge: before.dotAge, message: before.message });
    expect(game.state.relay!.graceUntil).toBe(grace);
    expect(game.state.relay!.streak).toBe(19);
    game.update(TICK_SECONDS);
    expect(game.state.relay!.deadline - game.state.frame).toBe(99);
  });
});

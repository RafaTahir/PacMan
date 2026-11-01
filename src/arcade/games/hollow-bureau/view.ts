import * as THREE from "three";
import type { ArcadeSimulation, ArcadeView, ThreeStage } from "../../shared/contracts";
import { ARENA, BEAT_TICKS, BOON_PADS, adrenalineLevel, onBeat, type BoonKind, type BureauState, type EnemyKind } from "./model";

const RED = 0xff3b2f, CYAN = 0x5ff5ff, GOLD = 0xffc857, BONE = 0xe9e4d6;
const BOON_COLOR: Record<BoonKind, number> = { overclock: 0xff7a3d, piercing: 0x9d8cff, afterimage: CYAN, bulwark: 0x7dff9a, crossfire: GOLD };

export function createView(stage: ThreeStage, simulation: ArcadeSimulation): ArcadeView {
  const state = simulation.state as BureauState;
  const root = new THREE.Group();
  root.name = "Hollow Bureau";
  stage.scene.add(root);
  const oldBackground = stage.scene.background;
  stage.scene.background = new THREE.Color(0x07080a);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const std = (color: number, rough = .9) => { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: .05 }); materials.push(m); return m; };
  const glow = (color: number, opacity = 1) => { const m = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide }); materials.push(m); return m; };
  const concrete = std(0x3a3b3d), dark = std(0x17181a), slab = std(0x2a2b2d);
  const red = glow(RED), cyan = glow(CYAN), gold = glow(GOLD), bone = glow(BONE);
  const redSoft = glow(RED, .4), cyanSoft = glow(CYAN, .35);
  const boonMaterial = Object.fromEntries(Object.entries(BOON_COLOR).map(([k, c]) => [k, glow(c)])) as Record<BoonKind, THREE.MeshBasicMaterial>;
  const box = geo(new THREE.BoxGeometry(1, 1, 1)), ringGeo = geo(new THREE.RingGeometry(.9, 1, 48)), cone = geo(new THREE.ConeGeometry(1, 1, 4)), octa = geo(new THREE.OctahedronGeometry(1)), sphere = geo(new THREE.SphereGeometry(1, 10, 8));
  const put = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); parent.add(o); return o;
  };
  const flat = (parent: THREE.Object3D, m: THREE.Material, r: number, y = .06) => { const o = put(parent, ringGeo, m, 0, y, 0, r, r, 1); o.rotation.x = -Math.PI / 2; return o; };

  root.add(new THREE.HemisphereLight(0xb9c4d4, 0x120d0d, 2.1));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.2); key.position.set(-6, 18, 8); root.add(key);
  const pulseLight = new THREE.PointLight(RED, 7, 15, 2); pulseLight.position.set(0, 4, 0); root.add(pulseLight);

  put(root, box, slab, 0, -.35, 0, 24.4, .6, 18.4);
  put(root, box, dark, 0, -.7, 0, 25.4, .3, 19.4);
  for (let i = -5; i <= 5; i++) put(root, box, dark, i * 2.1, -.03, 0, .05, .02, 17.6);
  for (let j = -4; j <= 4; j++) put(root, box, dark, 0, -.03, j * 2.1, 23.2, .02, .05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(root, box, concrete, sx * 12.3, 1.2, sz * 9.3, 1.6, 2.8, 1.6);
  for (let i = -4; i <= 4; i++) {
    put(root, box, concrete, i * 2.6, .9, -9.4, 2.2, 2.2 + (i % 2 ? .8 : 0), .8);
    put(root, box, concrete, i * 2.6, .5, 9.5, 2.2, 1.4, .6);
  }
  for (const side of [-1, 1]) for (let j = -3; j <= 3; j++) put(root, box, concrete, side * 12.4, .6, j * 2.5, .7, 1.6, 2);
  put(root, box, red, 0, .25, -9.0, 8, .05, .05);

  const thinRing = geo(new THREE.RingGeometry(.985, 1, 64)), beatRing = put(root, thinRing, redSoft, 0, .08, 0, ARENA.halfHeight, ARENA.halfHeight, 1); beatRing.rotation.x = -Math.PI / 2;
  const padGroups = BOON_PADS.map(spot => {
    const g = new THREE.Group(); g.position.set(spot.x, 0, spot.y); g.visible = false; root.add(g);
    const base = put(g, box, dark, 0, .08, 0, 2.2, .16, 2.2);
    const core = put(g, octa, bone, 0, .9, 0, .38, .55, .38);
    const halo = flat(g, glow(0xffffff, .5), 1.15, .2);
    return { g, base, core, halo };
  });

  const player = new THREE.Group(); root.add(player);
  put(player, box, bone, 0, .38, 0, .5, .46, .6);
  put(player, cone, red, 0, .4, -.46, .26, .4, .26).rotation.x = -Math.PI / 2;
  const shield = flat(player, cyanSoft, .8, .05);
  const dashTrail = put(root, box, cyanSoft, 0, .3, 0, .5, .1, 1.5);

  const bodies = new Map<number, THREE.Group>(), bullets = new Map<number, THREE.Mesh>(), effects = new Map<number, THREE.Mesh>();
  function makeEnemy(kind: EnemyKind) {
    const g = new THREE.Group(); root.add(g);
    if (kind === "drifter") put(g, octa, red, 0, .45, 0, .38, .38, .38);
    else if (kind === "caster") { put(g, box, concrete, 0, .5, 0, .7, 1, .7); put(g, sphere, gold, 0, 1.15, 0, .22, .22, .22); }
    else { put(g, box, concrete, 0, .6, 0, 1.2, 1.2, 1.2); put(g, box, red, 0, 1.25, 0, .7, .12, .7); }
    const tell = put(g, box, redSoft, 0, .05, 0, .08, .02, 1); tell.visible = false;
    return Object.assign(g, { userData: { tell } });
  }
  const effectMat = { kill: glow(GOLD, .7), hurt: glow(RED, .7), dash: glow(CYAN, .5), boon: glow(0xffffff, .6), beat: glow(RED, .6) };

  function update(_alpha: number, options: { reducedMotion: boolean; highContrast: boolean }) {
    const p = state.player, t = state.tick / 60;
    const beatPhase = (state.tick % BEAT_TICKS) / BEAT_TICKS;
    const sharp = options.reducedMotion ? 0 : Math.pow(1 - beatPhase, 3);
    const live = onBeat(state.tick);
    beatRing.scale.setScalar(ARENA.halfHeight * (1 - sharp * .08)); beatRing.visible = true;
    (beatRing.material as THREE.MeshBasicMaterial).opacity = live ? .75 : options.highContrast ? .5 : .28;
    pulseLight.intensity = 6 + sharp * (4 + adrenalineLevel(state));
    pulseLight.color.setHex(state.offer ? GOLD : adrenalineLevel(state) >= 3 ? CYAN : RED);
    player.position.set(p.x, 0, p.y); player.rotation.y = Math.atan2(p.aimX, p.aimY) + Math.PI;
    player.visible = p.invulnerable === 0 || Math.floor(state.tick / 4) % 2 === 0 || p.dashTicks > 0;
    shield.visible = p.dashTicks > 0 || p.dashCooldown === 0 && options.highContrast;
    dashTrail.visible = p.dashTicks > 0;
    if (p.dashTicks > 0) { dashTrail.position.set(p.x - p.dashX * .7, .3, p.y - p.dashY * .7); dashTrail.rotation.y = Math.atan2(p.dashX, p.dashY); }
    padGroups.forEach((pad, i) => {
      const boon = state.offer?.[i]; pad.g.visible = Boolean(boon);
      if (!boon) return;
      pad.core.material = boonMaterial[boon];
      (pad.halo.material as THREE.MeshBasicMaterial).color.setHex(BOON_COLOR[boon]);
      pad.core.rotation.y = options.reducedMotion ? .6 : t * 1.6; pad.halo.scale.setScalar(1.15 + (options.reducedMotion ? 0 : Math.sin(t * 4) * .06));
    });
    const liveEnemies = new Set<number>();
    for (const e of state.enemies) {
      liveEnemies.add(e.id);
      let g = bodies.get(e.id); if (!g) { g = makeEnemy(e.kind); bodies.set(e.id, g); }
      g.position.set(e.x, 0, e.y); g.scale.setScalar(e.spawnTicks > 0 ? .4 + (1 - e.spawnTicks / 60) * .4 : e.flash ? 1.12 : 1);
      g.rotation.y = e.kind === "drifter" && !options.reducedMotion ? e.age * .08 : 0;
      const tell = g.userData.tell as THREE.Mesh, telling = e.spawnTicks === 0 && (e.chargeTicks > 0 || (e.kind !== "drifter" && e.cooldown <= 28 && e.cooldown > 0));
      tell.visible = telling;
      if (telling) { const len = e.kind === "hulk" ? 5 : 9; tell.position.set(e.aimX * len / 2, .05, e.aimY * len / 2); tell.rotation.y = Math.atan2(e.aimX, e.aimY) - g.rotation.y; tell.scale.set(e.kind === "hulk" ? 1 : .08, .02, len); }
    }
    for (const [id, g] of bodies) if (!liveEnemies.has(id)) { root.remove(g); bodies.delete(id); }
    const liveBullets = new Set<number>();
    for (const b of state.bullets) {
      liveBullets.add(b.id);
      let m = bullets.get(b.id);
      if (!m) { m = put(root, b.hostile ? sphere : box, b.hostile ? red : b.onBeat ? gold : cyan, 0, .5, 0, 1, 1, 1); bullets.set(b.id, m); }
      m.position.set(b.x, b.hostile ? .5 : .7, b.y);
      if (b.hostile) m.scale.setScalar(b.radius * (options.highContrast ? 1.3 : 1)); else { m.scale.set(b.onBeat ? .14 : .09, .09, .5); m.rotation.y = Math.atan2(b.vx, b.vy); }
    }
    for (const [id, m] of bullets) if (!liveBullets.has(id)) { root.remove(m); bullets.delete(id); }
    const liveEffects = new Set<number>();
    for (const e of state.effects) {
      liveEffects.add(e.id);
      let m = effects.get(e.id); if (!m) { m = flat(root, effectMat[e.kind], .3); effects.set(e.id, m); }
      const progress = 1 - e.ttl / e.maxTtl;
      m.position.set(e.x, .12, e.y); m.scale.setScalar(options.reducedMotion ? .9 : .25 + progress * (e.kind === "boon" ? 3.2 : 1.6)); m.visible = progress < .9;
    }
    for (const [id, m] of effects) if (!liveEffects.has(id)) { root.remove(m); effects.delete(id); }
  }

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point = new THREE.Vector3();
  function resize(width: number, height: number) {
    const aspect = Math.max(.2, width / Math.max(1, height)), half = Math.max(10.2, (ARENA.halfWidth + 2) / aspect);
    const c = stage.camera; c.left = -half * aspect; c.right = half * aspect; c.top = half; c.bottom = -half; c.near = .1; c.far = 100;
    c.position.set(0, 30, 18); c.lookAt(0, 0, 0); c.updateProjectionMatrix(); c.updateMatrixWorld();
  }
  resize(stage.width, stage.height);
  return {
    update, resize,
    aimAt(x, y) {
      pointer.set(x, -y); raycaster.setFromCamera(pointer, stage.camera);
      if (raycaster.ray.intersectPlane(ground, point)) {
        const dx = point.x - state.player.x, dy = point.z - state.player.y, len = Math.hypot(dx, dy);
        if (len > .1) return { aimX: Math.round(dx / len * 127), aimY: Math.round(dy / len * 127) };
      }
      return { aimX: Math.round(state.player.aimX * 127), aimY: Math.round(state.player.aimY * 127) };
    },
    dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); stage.scene.background = oldBackground; },
  };
}

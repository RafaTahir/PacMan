import * as THREE from "three";
import type { ArcadeSimulation, ArcadeView, ThreeStage, VisualOptions } from "../../shared/contracts";
import { ARENA, DASH_COOLDOWN, type Enemy, type EnemyKind, type SiegeState } from "./model";

const COLORS = { cyan: 0x43f8e4, pink: 0xff5c83, gold: 0xffd36b, purple: 0xb68aff, orange: 0xff9259, white: 0xf0fffb };
type Actor = { root: THREE.Group; body: THREE.Group; halo?: THREE.Mesh; tell?: THREE.Mesh; health?: THREE.Mesh; ring?: THREE.Mesh };

/** All game geometry is procedural. Shared buffers and ID pools keep allocation off the render path. */
export function createView(stage: ThreeStage, simulation: ArcadeSimulation): ArcadeView {
  const state = simulation.state as SiegeState;
  const root = new THREE.Group();
  root.name = "Chrome Siege";
  stage.scene.add(root);
  const oldBackground = stage.scene.background;
  stage.scene.background = new THREE.Color(0x050a11);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geometry = <T extends THREE.BufferGeometry>(value: T) => { geometries.push(value); return value; };
  const material = <T extends THREE.Material>(value: T) => { materials.push(value); return value; };
  const hull = material(new THREE.MeshStandardMaterial({ color: 0x344554, metalness: .72, roughness: .34 }));
  const black = material(new THREE.MeshStandardMaterial({ color: 0x0a111d, metalness: .55, roughness: .48 }));
  const floorMaterial = material(new THREE.MeshStandardMaterial({ color: 0x0c1723, metalness: .42, roughness: .78 }));
  const railMaterial = material(new THREE.MeshStandardMaterial({ color: 0x243343, metalness: .7, roughness: .36 }));
  const glow = (color: number) => material(new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const cyan = glow(COLORS.cyan), pink = glow(COLORS.pink), gold = glow(COLORS.gold), purple = glow(COLORS.purple), orange = glow(COLORS.orange), white = glow(COLORS.white);
  const dim = glow(0x244452);
  const gridMaterial = material(new THREE.LineBasicMaterial({ color: 0x24404e, transparent: true, opacity: .45 }));
  const silhouette: Record<EnemyKind, THREE.Material> = { drone: pink, gunner: gold, brute: purple, boss: orange };
  const tellMaterial = material(new THREE.MeshBasicMaterial({ color: COLORS.pink, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide }));
  const bossTellMaterial = material(new THREE.MeshBasicMaterial({ color: COLORS.orange, transparent: true, opacity: .48, depthWrite: false, side: THREE.DoubleSide }));
  const dashMaterial = material(new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: .4, depthWrite: false }));
  const effectMaterials = {
    kill: material(new THREE.MeshBasicMaterial({ color: COLORS.orange, transparent: true, opacity: .7, depthWrite: false, side: THREE.DoubleSide })),
    hurt: material(new THREE.MeshBasicMaterial({ color: COLORS.pink, transparent: true, opacity: .7, depthWrite: false, side: THREE.DoubleSide })),
    dash: dashMaterial,
    upgrade: material(new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: .7, depthWrite: false, side: THREE.DoubleSide })),
  };
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 16));
  const sphere = geometry(new THREE.SphereGeometry(1, 10, 8));
  const octahedron = geometry(new THREE.OctahedronGeometry(1));
  const torus = geometry(new THREE.TorusGeometry(1, .045, 5, 40));
  const ring = geometry(new THREE.RingGeometry(.91, 1, 48));
  const cone = geometry(new THREE.ConeGeometry(1, 1, 4));
  function mesh(parent: THREE.Object3D, geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const result = new THREE.Mesh(geom, mat); result.position.set(x, y, z); result.scale.set(sx, sy, sz); parent.add(result); return result;
  }
  function flatRing(parent: THREE.Object3D, mat: THREE.Material, radius: number, y = .05) {
    const result = mesh(parent, ring, mat, 0, y, 0, radius, radius, 1); result.rotation.x = -Math.PI / 2; return result;
  }
  const ambient = new THREE.HemisphereLight(0xb7e6ff, 0x1a132a, 2.4); root.add(ambient);
  const key = new THREE.DirectionalLight(0xd4efff, 2.6); key.position.set(-8, 16, 6); root.add(key);
  const rim = new THREE.DirectionalLight(0x9e85ff, 1.1); rim.position.set(7, 9, -10); root.add(rim);
  const coreLight = new THREE.PointLight(COLORS.cyan, 8, 13, 2); coreLight.position.set(0, 5, 0); root.add(coreLight);
  mesh(root, box, floorMaterial, 0, -.3, 0, 25.8, .5, 19.8);
  mesh(root, box, black, 0, -.6, 0, 26.6, .25, 20.6);
  // Floor grid, center landing pad and runway markings are visual; movement remains unobstructed.
  const vertices: number[] = [];
  for (let x = -12; x <= 12; x += 2) vertices.push(x, -.035, -9, x, -.035, 9);
  for (let z = -8; z <= 8; z += 2) vertices.push(-12, -.035, z, 12, -.035, z);
  const grid = geometry(new THREE.BufferGeometry()); grid.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  root.add(new THREE.LineSegments(grid, gridMaterial));
  const pad = new THREE.Group(); root.add(pad); flatRing(pad, dim, 3.3, -.015); flatRing(pad, dim, 3.05, -.012);
  for (const side of [-1, 1]) {
    mesh(root, box, railMaterial, side * 12.3, .12, 0, .35, .45, 18.9);
    mesh(root, box, cyan, side * 12.08, .16, 0, .045, .07, 18);
    mesh(root, box, railMaterial, 0, .12, side * 9.3, 24.9, .45, .35);
    mesh(root, box, side < 0 ? pink : cyan, 0, .17, side * 9.08, 24, .07, .045);
    for (let i = -10; i <= 10; i += 2) {
      mesh(root, box, dim, i, -.005, side * 8.55, .6, .015, .12);
      if (Math.abs(i) > 7) mesh(root, box, gold, i, .015, side * 8.15, .55, .02, .12).rotation.y = side * .6;
    }
    for (const z of [-9.4, 9.4]) {
      mesh(root, cylinder, black, side * 12.5, .4, z, .48, 1, .48);
      mesh(root, cylinder, hull, side * 12.5, 1, z, .31, .6, .31);
      mesh(root, cylinder, z < 0 ? pink : cyan, side * 12.5, 1.35, z, .33, .08, .33);
    }
  }
  // Outside-wall power cells and recessed hazard stripes reinforce the arena depth.
  // Their silhouettes never imply collidable cover inside the movement field.
  for (const side of [-1, 1]) {
    for (const z of [-6, -2, 2, 6]) {
      mesh(root, box, black, side * 12.9, 0.38, z, 0.5, 0.72, 1.25);
      mesh(root, box, hull, side * 12.9, 0.8, z, 0.42, 0.16, 1.12);
      mesh(root, box, side < 0 ? purple : cyan, side * 12.63, 0.42, z, 0.04, 0.32, 0.7);
    }
    for (let x = -7; x <= 7; x += 2) {
      const stripe = mesh(root, box, dim, x, -0.008, side * 8.65, 0.7, 0.012, 0.22); stripe.rotation.y = -0.55;
    }
    for (const x of [-11.2, 11.2]) {
      const warning = mesh(root, torus, gold, x, 0.025, side * 7.9, 0.42, 0.42, 0.42); warning.rotation.x = Math.PI / 2;
    }
  }
  // The player is a twin-pontoon hovercraft with an independent turret and active thrusters.
  const player = new THREE.Group(); root.add(player);
  const hover = new THREE.Group(); player.add(hover);
  const turret = new THREE.Group(); hover.add(turret);
  mesh(hover, box, hull, 0, .45, 0, .8, .32, 1.05);
  const nose = mesh(hover, cone, hull, 0, .46, -.53, .56, .5, .45); nose.rotation.x = -Math.PI / 2; nose.rotation.y = Math.PI / 4;
  for (const side of [-1, 1]) {
    mesh(hover, box, black, side * .51, .29, 0, .3, .3, 1.14);
    mesh(hover, box, cyan, side * .52, .28, 0, .32, .075, 1.02);
    mesh(hover, cylinder, hull, side * .48, .49, .25, .16, .1, .16);
  }
  mesh(turret, cylinder, cyan, 0, .65, 0, .23, .2, .23);
  mesh(turret, box, hull, 0, .74, -.36, .18, .17, .7);
  mesh(turret, box, white, 0, .74, -.71, .12, .1, .08);
  const thrusters: THREE.Mesh[] = [];
  for (const side of [-1, 1]) thrusters.push(mesh(hover, sphere, cyan, side * .49, .22, .56, .1, .1, .25));
  const playerRing = flatRing(player, cyan, .9);
  const cooldownRing = mesh(player, torus, dim, 0, .065, 0, 1.02, 1.02, 1.02); cooldownRing.rotation.x = Math.PI / 2;
  const readyNotch = mesh(player, box, white, 0, .08, -1.03, .16, .05, .2);
  const aimMarker = mesh(root, cone, cyan, 0, .08, 0, .22, .35, .18); aimMarker.rotation.x = -Math.PI / 2;
  const shadowMaterial = material(new THREE.MeshBasicMaterial({ color: 0x000407, transparent: true, opacity: .48, depthWrite: false }));
  const shadowGeometry = geometry(new THREE.CircleGeometry(1, 24));
  const playerShadow = mesh(root, shadowGeometry, shadowMaterial, 0, .005, 0, .75, 1, 1); playerShadow.rotation.x = -Math.PI / 2;
  const enemyActors = new Map<number, Actor>();
  const bullets = new Map<number, THREE.Mesh>();
  const pickups = new Map<number, THREE.Group>();
  const effects = new Map<number, THREE.Mesh>();
  function makeEnemy(enemy: Enemy): Actor {
    const actor = new THREE.Group(), body = new THREE.Group(); actor.add(body); root.add(actor);
    const color = silhouette[enemy.kind];
    const halo = flatRing(actor, color, enemy.radius + .2, .035);
    const shadow = mesh(actor, shadowGeometry, shadowMaterial, 0, .01, 0, enemy.radius * 1.15, enemy.radius * 1.15, 1); shadow.rotation.x = -Math.PI / 2;
    let tell: THREE.Mesh | undefined;
    let health: THREE.Mesh | undefined;
    if (enemy.kind === "drone") {
      mesh(body, octahedron, hull, 0, .65, 0, .47, .4, .47);
      mesh(body, sphere, color, 0, .68, -.3, .2, .13, .16);
      for (const side of [-1, 1]) {
        const wing = mesh(body, box, hull, side * .46, .57, .08, .43, .14, .35); wing.rotation.z = side * .2;
        mesh(body, box, color, side * .57, .57, .08, .08, .17, .33);
      }
    } else if (enemy.kind === "gunner") {
      mesh(body, cylinder, hull, 0, .49, 0, .48, .38, .48);
      mesh(body, cylinder, color, 0, .73, 0, .33, .12, .33);
      mesh(body, box, black, 0, .74, -.42, .21, .22, .7);
      mesh(body, box, color, 0, .74, -.78, .19, .12, .08);
      for (let i = 0; i < 3; i++) {
        const leg = mesh(body, box, hull, Math.sin(i * Math.PI * 2 / 3) * .46, .2, Math.cos(i * Math.PI * 2 / 3) * .46, .14, .3, .45);
        leg.rotation.y = i * Math.PI * 2 / 3;
      }
    } else if (enemy.kind === "brute") {
      mesh(body, box, hull, 0, .57, 0, 1.1, .72, .95);
      mesh(body, box, color, 0, .6, -.52, .85, .13, .12);
      for (const side of [-1, 1]) {
        mesh(body, box, black, side * .59, .27, 0, .24, .4, 1.15);
        mesh(body, box, color, side * .59, .5, .13, .14, .07, .8);
        const horn = mesh(body, cone, hull, side * .38, .65, -.72, .18, .45, .18); horn.rotation.x = -Math.PI / 2;
      }
      mesh(body, cylinder, black, 0, .98, 0, .28, .18, .28);
    } else {
      mesh(body, cylinder, black, 0, .5, 0, 1.4, .75, 1.4);
      mesh(body, cylinder, hull, 0, .95, 0, 1.16, .5, 1.16);
      mesh(body, octahedron, color, 0, 1.58, 0, .52, .65, .52);
      for (const side of [-1, 1]) {
        mesh(body, box, hull, side * 1.5, .85, 0, .55, .55, 1.8);
        mesh(body, box, color, side * 1.5, .85, -.92, .31, .25, .1);
        mesh(body, cylinder, color, side * 1.5, .48, .4, .35, .08, .35);
        mesh(body, box, black, side * .65, .75, -1, .28, .3, .85);
      }
      const crown = mesh(body, torus, orange, 0, 1.18, 0, 1.3, 1.3, 1.3); crown.rotation.x = Math.PI / 2;
      const barBack = mesh(actor, box, black, 0, 2.65, 0, 3.4, .16, .12); barBack.rotation.x = -.2;
      health = mesh(actor, box, color, 0, 2.65, .025, 3.3, .11, .13);
    }
    if (enemy.kind !== "drone") {
      tell = mesh(actor, box, enemy.kind === "boss" ? bossTellMaterial : tellMaterial, 0, .025, 0, .16, .025, 1);
    }
    const warning = flatRing(actor, enemy.kind === "boss" ? bossTellMaterial : tellMaterial, enemy.radius + .65, .026);
    return { root: actor, body, halo, tell, health, ring: warning };
  }
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  let highContrast: boolean | undefined;
  let previousViewTick = -1, previousX = state.player.x, previousY = state.player.y, hullHeading = 0;
  function update(_alpha: number, options: VisualOptions) {
    const t = state.tick / 60, p = state.player;
    if (highContrast !== options.highContrast) {
      highContrast = options.highContrast;
      floorMaterial.color.setHex(highContrast ? 0x152331 : 0x0c1723);
      gridMaterial.opacity = highContrast ? .8 : .45;
      tellMaterial.opacity = highContrast ? .72 : .45;
      bossTellMaterial.opacity = highContrast ? .76 : .48;
    }
    player.position.set(p.x, 0, p.y);
    const angle = Math.atan2(-p.aimX, -p.aimY);
    if (previousViewTick !== state.tick) {
      const dx = p.x - previousX, dy = p.y - previousY;
      if (Math.hypot(dx, dy) > .01) hullHeading = Math.atan2(-dx, -dy);
      previousViewTick = state.tick; previousX = p.x; previousY = p.y;
    }
    hover.rotation.y = hullHeading;
    turret.rotation.y = angle - hullHeading;
    hover.position.y = options.reducedMotion ? 0 : Math.sin(t * 5) * .035;
    hover.visible = p.hp > 0;
    // Grace is shown with a steady protective ring, never a rapid flashing actor.
    playerRing.visible = p.invulnerable > 0 || p.dashTicks > 0;
    playerRing.scale.setScalar(p.dashTicks > 0 ? 1.1 : 1);
    playerRing.material = p.dashTicks > 0 ? white : cyan;
    const ready = 1 - p.dashCooldown / (p.level >= 4 ? 120 : DASH_COOLDOWN);
    cooldownRing.material = p.dashCooldown === 0 ? cyan : dim;
    readyNotch.position.set(Math.sin(ready * Math.PI * 2) * 1.02, .08, -Math.cos(ready * Math.PI * 2) * 1.02);
    readyNotch.rotation.y = -ready * Math.PI * 2;
    thrusters.forEach(thruster => { thruster.scale.z = p.dashTicks > 0 ? .8 : options.reducedMotion ? .2 : .22 + Math.sin(t * 18) * .04; });
    aimMarker.position.set(p.x + p.aimX * 1.5, .1, p.y + p.aimY * 1.5);
    aimMarker.rotation.z = 0; aimMarker.rotation.y = angle;
    playerShadow.position.set(p.x, .005, p.y);
    const liveEnemies = new Set<number>();
    for (const enemy of state.enemies) {
      liveEnemies.add(enemy.id);
      let actor = enemyActors.get(enemy.id);
      if (!actor) { actor = makeEnemy(enemy); enemyActors.set(enemy.id, actor); }
      actor.root.position.set(enemy.x, 0, enemy.y);
      actor.body.rotation.y = Math.atan2(-enemy.aimX, -enemy.aimY);
      actor.body.position.y = options.reducedMotion || enemy.kind === "brute" ? 0 : Math.sin(t * 4 + enemy.id) * .07;
      const spawning = enemy.spawnTicks > 0;
      actor.body.scale.setScalar(spawning ? .4 + .6 * (1 - enemy.spawnTicks / (enemy.kind === "boss" ? 120 : 42)) : 1);
      actor.body.position.y += spawning ? .5 : 0;
      if (actor.halo) actor.halo.material = enemy.flash > 0 ? white : silhouette[enemy.kind];
      const telling = !spawning && enemy.cooldown <= (enemy.kind === "gunner" ? 26 : 36) && enemy.chargeTicks === 0;
      if (actor.tell) {
        actor.tell.visible = telling;
        const length = enemy.kind === "brute" ? 5.5 : enemy.kind === "boss" ? 15 : 10;
        actor.tell.position.set(enemy.aimX * length / 2, .025, enemy.aimY * length / 2);
        actor.tell.rotation.y = Math.atan2(enemy.aimX, enemy.aimY);
        actor.tell.scale.set(enemy.kind === "brute" ? 1.1 : enemy.kind === "boss" ? .32 : .08, .025, length);
      }
      if (actor.ring) {
        actor.ring.visible = spawning || telling || enemy.chargeTicks > 0;
        actor.ring.scale.setScalar(enemy.kind === "boss" && telling ? 2.6 : enemy.radius + .65);
        if (!options.reducedMotion && spawning) actor.ring.rotation.z = t;
      }
      if (actor.health) {
        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        actor.health.scale.x = 3.3 * ratio; actor.health.position.x = -1.65 * (1 - ratio);
        actor.health.material = enemy.phase === 3 ? pink : enemy.phase === 2 ? gold : orange;
      }
    }
    for (const [id, actor] of enemyActors) if (!liveEnemies.has(id)) { root.remove(actor.root); enemyActors.delete(id); }
    const liveBullets = new Set<number>();
    for (const bullet of state.bullets) {
      liveBullets.add(bullet.id);
      let actor = bullets.get(bullet.id);
      if (!actor) {
        actor = mesh(root, bullet.hostile ? sphere : box, bullet.hostile ? pink : cyan, 0, .4, 0, 1, 1, 1);
        bullets.set(bullet.id, actor);
      }
      actor.position.set(bullet.x, bullet.hostile ? .48 : .7, bullet.y);
      if (bullet.hostile) actor.scale.setScalar(bullet.radius * (options.highContrast ? 1.25 : 1));
      else { actor.scale.set(.09, .09, .42); actor.rotation.y = Math.atan2(bullet.vx, bullet.vy); }
    }
    for (const [id, actor] of bullets) if (!liveBullets.has(id)) { root.remove(actor); bullets.delete(id); }
    const livePickups = new Set<number>();
    for (const pickup of state.pickups) {
      livePickups.add(pickup.id);
      let actor = pickups.get(pickup.id);
      if (!actor) {
        actor = new THREE.Group(); root.add(actor); pickups.set(pickup.id, actor);
        if (pickup.kind === "core") mesh(actor, octahedron, cyan, 0, .36, 0, .21, .33, .21);
        else {
          mesh(actor, box, white, 0, .38, 0, .22, .12, .65);
          mesh(actor, box, white, 0, .38, 0, .65, .12, .22);
        }
        flatRing(actor, pickup.kind === "core" ? dim : cyan, .4);
      }
      actor.position.set(pickup.x, options.reducedMotion ? 0 : Math.sin(t * 3 + pickup.id) * .08, pickup.y);
      actor.rotation.y = options.reducedMotion ? Math.PI / 4 : t * .8;
    }
    for (const [id, actor] of pickups) if (!livePickups.has(id)) { root.remove(actor); pickups.delete(id); }
    const liveEffects = new Set<number>();
    for (const effect of state.effects) {
      liveEffects.add(effect.id);
      let actor = effects.get(effect.id);
      if (!actor) { actor = flatRing(root, effectMaterials[effect.kind], .3); effects.set(effect.id, actor); }
      const progress = 1 - effect.ttl / effect.maxTtl;
      actor.position.set(effect.x, .1, effect.y);
      actor.scale.setScalar(options.reducedMotion ? .9 : .25 + progress * (effect.kind === "upgrade" ? 3 : 1.5));
      actor.visible = options.reducedMotion ? progress < .65 : progress < .9;
    }
    for (const [id, actor] of effects) if (!liveEffects.has(id)) { root.remove(actor); effects.delete(id); }
    // The north rail advertises the transition from assault to the boss encounter.
    coreLight.color.setHex(state.bossSpawned ? COLORS.orange : COLORS.cyan);
    coreLight.intensity = options.reducedMotion ? 7 : state.bossSpawned ? 8 + Math.sin(t) : 7;
  }
  function resize(width: number, height: number) {
    const aspect = Math.max(.2, width / Math.max(1, height));
    const halfHeight = Math.max(10.5, (ARENA.halfWidth + 2) / aspect);
    stage.camera.left = -halfHeight * aspect; stage.camera.right = halfHeight * aspect;
    stage.camera.top = halfHeight; stage.camera.bottom = -halfHeight;
    stage.camera.near = .1; stage.camera.far = 100;
    stage.camera.position.set(0, 30, 19);
    stage.camera.lookAt(0, 0, 0); stage.camera.updateProjectionMatrix(); stage.camera.updateMatrixWorld();
  }
  resize(stage.width, stage.height);
  return {
    update, resize,
    aimAt(x, y) {
      pointer.set(x, -y); raycaster.setFromCamera(pointer, stage.camera);
      if (raycaster.ray.intersectPlane(ground, point)) {
        const dx = point.x - state.player.x, dy = point.z - state.player.y;
        const length = Math.hypot(dx, dy);
        if (length > .1) return { aimX: Math.round(dx / length * 127), aimY: Math.round(dy / length * 127) };
      }
      return { aimX: Math.round(state.player.aimX * 127), aimY: Math.round(state.player.aimY * 127) };
    },
    dispose() {
      root.removeFromParent(); geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
      stage.scene.background = oldBackground;
    },
  };
}

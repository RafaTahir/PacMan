import * as THREE from "three";
import type { ArcadeSimulation, ArcadeView, ThreeStage, VisualOptions } from "../../shared/contracts";
import { clamp, lerp } from "../../shared/math";
import { BOARD, LIMITS, type ReactorState, type TowerKind } from "./model";

const COLORS: Record<TowerKind, number> = { core: 0x28cbd6, armored: 0x7c8dbb, volatile: 0xff893e, capacitor: 0xd6ec55 };
const CONTRAST: Record<TowerKind, number> = { core: 0x57f2ff, armored: 0xc9d5ff, volatile: 0xffa84c, capacitor: 0xf4ff74 };
const DROP_COLORS = { wide: 0xcb8cff, multiball: 0xf6f4d1, shield: 0x54e6ff };

/** The rendering is deliberately separate from the replay model. */
export function createView(stage: ThreeStage, simulation: ArcadeSimulation): ArcadeView {
  const state = simulation.state as ReactorState;
  const root = new THREE.Group();
  root.name = "reactor-breaker";
  stage.scene.add(root);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.push(value); return value; };
  const material = <T extends THREE.Material>(value: T): T => { materials.push(value); return value; };
  const standard = (color: number, metalness = 0.3, roughness = 0.5) => material(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  const basic = (color: number) => material(new THREE.MeshBasicMaterial({ color }));
  const add = <T extends THREE.Object3D>(object: T): T => { root.add(object); return object; };
  const box = (width: number, height: number, depth: number) => geometry(new THREE.BoxGeometry(width, height, depth));
  const mesh = (shape: THREE.BufferGeometry, surface: THREE.Material, x = 0, height = 0, z = 0) => {
    const object = add(new THREE.Mesh(shape, surface)); object.position.set(x, height, z); return object;
  };
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const instance = (shape: THREE.BufferGeometry, surface: THREE.Material, count: number) => {
    const object = add(new THREE.InstancedMesh(shape, surface, count));
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    object.frustumCulled = false;
    return object;
  };
  const setInstance = (object: THREE.InstancedMesh, index: number, x: number, height: number, z: number, sx = 1, sy = 1, sz = 1, rotation = 0) => {
    dummy.position.set(x, height, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, rotation, 0); dummy.updateMatrix(); object.setMatrixAt(index, dummy.matrix);
  };
  add(new THREE.HemisphereLight(0xc4f0ff, 0x152836, 2.25));
  const key = add(new THREE.DirectionalLight(0xd6e6ff, 2.8)); key.position.set(-5, 15, -8);
  const rim = add(new THREE.DirectionalLight(0x56d1ce, 1.3)); rim.position.set(8, 5, 8);

  const deck = standard(0x0b1520, 0.65, 0.6);
  mesh(box(17.5, 0.38, 21), deck, 0, -0.24, 0.35);
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 1280;
  const context = canvas.getContext("2d");
  const floorTexture = new THREE.CanvasTexture(canvas); floorTexture.colorSpace = THREE.SRGBColorSpace; floorTexture.anisotropy = Math.min(4, stage.renderer.capabilities.getMaxAnisotropy()); textures.push(floorTexture);
  const floorMaterial = material(new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.92, metalness: 0.15 }));
  const floor = mesh(geometry(new THREE.PlaneGeometry(16, 19.7)), floorMaterial, 0, -0.025, 0.35); floor.rotation.x = -Math.PI / 2;
  const railMaterial = standard(0x23374a, 0.72, 0.35);
  const railGlow = basic(0x23888e);
  for (const direction of [-1, 1]) {
    mesh(box(0.22, 0.38, 20.1), railMaterial, direction * 8.18, 0.1, 0.35);
    mesh(box(0.035, 0.04, 19.7), railGlow, direction * 8.035, 0.22, 0.35);
    for (let z = -8.5; z < 10; z += 2.2) mesh(box(0.4, 0.45, 0.19), railMaterial, direction * 8.16, 0.13, z);
  }
  mesh(box(16.5, 0.4, 0.22), railMaterial, 0, 0.12, -9.68);
  mesh(box(15.8, 0.04, 0.035), railGlow, 0, 0.35, -9.54);
  // Exterior power couplings create a tangible containment machine without obstructing play.
  const couplingShape = geometry(new THREE.CylinderGeometry(0.26, 0.34, 0.7, 12));
  const couplingRing = geometry(new THREE.TorusGeometry(0.29, 0.045, 5, 16)); couplingRing.rotateX(Math.PI / 2);
  const couplingGlow = basic(0x63ddd0);
  for (const side of [-1, 1]) for (const z of [-8.2, -3.1, 2.0, 7.1]) {
    mesh(couplingShape, railMaterial, side * 8.48, 0.43, z);
    mesh(couplingRing, couplingGlow, side * 8.48, 0.72, z);
    mesh(box(0.055, 0.035, 3.8), couplingGlow, side * 8.48, 0.04, z + 1.85);
  }
  const shieldMaterial = material(new THREE.MeshBasicMaterial({ color: 0x54e6ff, transparent: true, opacity: 0.65 }));
  const shield = mesh(box(15.65, 0.07, 0.075), shieldMaterial, 0, 0.16, 10.02);
  const reserveShield = mesh(box(15.65, 0.025, 0.04), shieldMaterial, 0, 0.12, 10.17);

  const footingMaterial = standard(0x182a36, 0.68, 0.55);
  const footings = instance(box(1.87, 0.08, 1.34), footingMaterial, LIMITS.towers);
  for (const tower of state.towers) setInstance(footings, tower.id, tower.x, 0.025, tower.y);
  footings.instanceMatrix.needsUpdate = true;
  const casingMaterial = material(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x0b1520, emissiveIntensity: 0.35, metalness: 0.48, roughness: 0.34 }));
  const casings = instance(box(1.62, 0.37, 1.09), casingMaterial, LIMITS.towers * 4);
  const seams = instance(box(1.68, 0.055, 1.13), standard(0x142733, 0.6, 0.42), LIMITS.towers * 4);
  const vents = instance(box(0.075, 0.19, 0.025), basic(0x082630), LIMITS.towers * 4 * 3);
  const tops = instance(box(1.48, 0.055, 0.96), standard(0x142836, 0.55, 0.45), LIMITS.towers);
  const glyphMaterial = material(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const glyphBars = instance(box(0.48, 0.035, 0.075), glyphMaterial, LIMITS.towers * 3);
  const glyphRingGeometry = geometry(new THREE.TorusGeometry(0.23, 0.042, 5, 12)); glyphRingGeometry.rotateX(Math.PI / 2);
  const glyphRings = instance(glyphRingGeometry, glyphMaterial, LIMITS.towers * 2);
  const glyphDiamondGeometry = geometry(new THREE.CylinderGeometry(0.23, 0.23, 0.035, 4));
  const glyphDiamonds = instance(glyphDiamondGeometry, glyphMaterial, LIMITS.towers);

  const paddleBody = mesh(box(2.9, 0.23, 0.39), standard(0x527386, 0.8, 0.25), 0, 0.19, BOARD.paddleY);
  const paddleLightMaterial = basic(0x9bffea);
  const paddleLight = mesh(box(2.67, 0.045, 0.29), paddleLightMaterial, 0, 0.33, BOARD.paddleY - 0.025);
  const paddleInset = mesh(box(0.75, 0.05, 0.31), standard(0x162e3c, 0.7, 0.3), 0, 0.36, BOARD.paddleY - 0.025);
  const energyRail = mesh(box(0.62, 0.012, 0.035), basic(0xc4ff65), 0, 0.395, BOARD.paddleY - 0.025);
  const paddleShadow = mesh(box(3.05, 0.007, 0.68), material(new THREE.MeshBasicMaterial({ color: 0x000911, transparent: true, opacity: 0.6 })), 0, 0.005, BOARD.paddleY + 0.1);
  const ballGeometry = geometry(new THREE.SphereGeometry(BOARD.ballRadius, 12, 8));
  const ballWhite = basic(0xf4fffe), ballCharged = basic(0xe6ff7b);
  const ballMeshes = Array.from({ length: LIMITS.balls + 1 }, () => mesh(ballGeometry, ballWhite));
  const ballShadows = instance(geometry(new THREE.CircleGeometry(0.24, 12)), material(new THREE.MeshBasicMaterial({ color: 0x00131d, transparent: true, opacity: 0.72, side: THREE.DoubleSide })), LIMITS.balls + 1);
  const trailMaterial = material(new THREE.MeshBasicMaterial({ color: 0x47daca, transparent: true, opacity: 0.45, depthWrite: false }));
  const trails = instance(geometry(new THREE.SphereGeometry(0.12, 6, 4)), trailMaterial, LIMITS.balls * 9);
  const sparkMaterial = material(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const sparks = instance(box(1, 1, 1), sparkMaterial, LIMITS.particles);
  const ringGeometry = geometry(new THREE.RingGeometry(0.94, 1, 40)); ringGeometry.rotateX(-Math.PI / 2);
  const pulseHaloMaterial = material(new THREE.MeshBasicMaterial({ color: 0xd9ff78, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  const pulseHalo = mesh(ringGeometry, pulseHaloMaterial, 0, 0.03, BOARD.paddleY - 0.55);
  const bursts = Array.from({ length: LIMITS.bursts }, () => mesh(ringGeometry, material(new THREE.MeshBasicMaterial({ color: 0xff9c4c, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }))));
  const pickupGeometry = geometry(new THREE.OctahedronGeometry(0.26));
  const pickupRingGeometry = geometry(new THREE.TorusGeometry(0.38, 0.035, 4, 16)); pickupRingGeometry.rotateX(Math.PI / 2);
  const pickupBarGeometry = box(0.45, 0.055, 0.055);
  const pickups = Array.from({ length: LIMITS.drops }, () => {
    const group = add(new THREE.Group());
    const surface = material(new THREE.MeshBasicMaterial({ color: 0xc5a2ff }));
    const core = new THREE.Mesh(pickupGeometry, surface), ring = new THREE.Mesh(pickupRingGeometry, surface), bar = new THREE.Mesh(pickupBarGeometry, surface);
    ring.position.y = -0.15; bar.position.y = 0.34;
    group.add(core, ring, bar);
    return { group, core, ring, bar, surface };
  });
  const raycaster = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), aimPoint = new THREE.Vector3();
  let lastStage = -1, lastContrast = false, disposed = false;

  function drawFloor(highContrast: boolean) {
    if (!context) return;
    const w = canvas.width, h = canvas.height;
    context.fillStyle = highContrast ? "#0b1b2a" : "#0a1721"; context.fillRect(0, 0, w, h);
    context.strokeStyle = highContrast ? "#355969" : "#152d39"; context.lineWidth = 1;
    for (let x = 0; x <= w; x += 64) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, h); context.stroke(); }
    for (let y = 0; y <= h; y += 64) { context.beginPath(); context.moveTo(0, y); context.lineTo(w, y); context.stroke(); }
    context.strokeStyle = highContrast ? "#598393" : "#254351"; context.lineWidth = 3;
    context.strokeRect(24, 22, w - 48, h - 44);
    // Etched bus traces distinguish the industrial floor from a plain wire grid.
    context.strokeStyle = highContrast ? "#3e7682" : "#1b3f4a"; context.lineWidth = 2;
    for (const side of [-1, 1]) for (let row = 0; row < 5; row++) {
      const x = w / 2 + side * (120 + row * 37), y = 160 + row * 125;
      context.beginPath(); context.moveTo(side < 0 ? 32 : w - 32, y); context.lineTo(x, y); context.lineTo(x, y + 70); context.lineTo(x - side * 35, y + 105); context.stroke();
      context.beginPath(); context.arc(x - side * 35, y + 105, 5, 0, Math.PI * 2); context.stroke();
    }

    const towerEnd = (-0.7 - BOARD.top) / (BOARD.bottom - BOARD.top) * h;
    context.setLineDash([12, 15]); context.beginPath(); context.moveTo(35, towerEnd); context.lineTo(w - 35, towerEnd); context.stroke(); context.setLineDash([]);
    context.font = "700 23px ui-monospace, monospace"; context.textAlign = "left"; context.fillStyle = highContrast ? "#97c3cc" : "#456975";
    context.fillText(`R E A C T O R   /   0${state.stage}`, 50, 71);
    context.font = "600 13px ui-monospace, monospace"; context.fillText("AFTER HOURS  //  CONTAINMENT ARRAY", 51, 96);
    context.textAlign = "right"; context.fillText("SHIFT: 02:00", w - 50, 72);
    context.font = "600 13px ui-monospace, monospace"; context.fillStyle = highContrast ? "#a7bec6" : "#3d5c69"; context.textAlign = "center";
    context.fillText("RETURN CORRIDOR", w / 2, h * 0.69);
    context.font = "700 12px ui-monospace, monospace"; context.fillText("FIELD CATCH / CAPACITOR RESERVE", w / 2, h - 24);
    context.fillStyle = highContrast ? "#ad8541" : "#655737";
    for (let x = 30; x < w - 35; x += 30) { context.beginPath(); context.moveTo(x, 10); context.lineTo(x + 12, 10); context.lineTo(x + 2, 22); context.lineTo(x - 10, 22); context.closePath(); context.fill(); }
    floorTexture.needsUpdate = true;
  }

  function resize(width: number, height: number) {
    const aspect = Math.max(0.2, width / Math.max(1, height));
    const halfHeight = Math.max(10.8, 9.05 / aspect);
    const camera = stage.camera;
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.near = 0.1; camera.far = 90; camera.position.set(0, 30, 13.5); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0.35); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  resize(stage.width, stage.height);

  function update(alpha: number, options: VisualOptions) {
    if (disposed) return;
    const interpolation = clamp(alpha, 0, 1), palette = options.highContrast ? CONTRAST : COLORS;
    if (lastStage !== state.stage || lastContrast !== options.highContrast) { drawFloor(options.highContrast); lastStage = state.stage; lastContrast = options.highContrast; }
    railGlow.color.setHex(options.highContrast ? 0x58c7cb : 0x23888e);
    shield.visible = state.shield > 0; reserveShield.visible = state.shield > 1;
    shieldMaterial.opacity = options.reducedMotion ? 0.7 : 0.63 + Math.sin(state.tick * 0.04) * 0.13;
    let layerIndex = 0, ventIndex = 0, topIndex = 0, barIndex = 0, ringIndex = 0, diamondIndex = 0;
    for (const tower of state.towers) {
      footings.setColorAt(tower.id, tint.setHex(tower.layers > 0 ? 0xffffff : 0x36505b));
      const color = tower.flash > 0 ? 0xeaffff : palette[tower.kind];
      const h = tower.layers * 0.44;
      for (let layer = 0; layer < tower.layers; layer++) {
        const level = 0.12 + layer * 0.44;
        setInstance(casings, layerIndex, tower.x, level + 0.19, tower.y);
        casings.setColorAt(layerIndex, tint.setHex(color).multiplyScalar(tower.kind === "armored" && tower.hp === 1 && layer === tower.layers - 1 ? 0.64 : 1));
        setInstance(seams, layerIndex, tower.x, level, tower.y);
        layerIndex++;
        for (let column = -1; column <= 1; column++) setInstance(vents, ventIndex++, tower.x + column * 0.34, level + 0.2, tower.y + 0.557);
      }
      if (tower.layers <= 0) continue;
      setInstance(tops, topIndex++, tower.x, h + 0.095, tower.y);
      const glyphY = h + 0.145;
      if (tower.kind === "volatile") {
        for (const angle of [-Math.PI / 4, Math.PI / 4]) { setInstance(glyphBars, barIndex, tower.x, glyphY, tower.y, 1, 1, 1, angle); glyphBars.setColorAt(barIndex++, tint.setHex(palette.volatile)); }
      } else if (tower.kind === "armored") {
        for (let stripe = -1; stripe <= 1; stripe++) { setInstance(glyphBars, barIndex, tower.x, glyphY, tower.y + stripe * 0.15, 0.95 - Math.abs(stripe) * 0.25, 1, 1); glyphBars.setColorAt(barIndex++, tint.setHex(palette.armored)); }
      } else if (tower.kind === "capacitor") {
        for (const scale of [0.55, 1.1]) { setInstance(glyphRings, ringIndex, tower.x, glyphY, tower.y, scale, 1, scale); glyphRings.setColorAt(ringIndex++, tint.setHex(palette.capacitor)); }
      } else {
        setInstance(glyphDiamonds, diamondIndex, tower.x, glyphY, tower.y, 1, 1, 1); glyphDiamonds.setColorAt(diamondIndex++, tint.setHex(palette.core));
      }
    }
    if (footings.instanceColor) footings.instanceColor.needsUpdate = true;
    const instanceCounts: [THREE.InstancedMesh, number][] = [[casings, layerIndex], [seams, layerIndex], [vents, ventIndex], [tops, topIndex], [glyphBars, barIndex], [glyphRings, ringIndex], [glyphDiamonds, diamondIndex]];
    for (const [object, count] of instanceCounts) { object.count = count; object.instanceMatrix.needsUpdate = true; if (object.instanceColor) object.instanceColor.needsUpdate = true; }
    const paddleX = lerp(state.paddle.prevX, state.paddle.x, interpolation), paddleScale = state.paddle.halfWidth / BOARD.paddleHalfWidth;
    for (const object of [paddleBody, paddleLight, paddleInset, energyRail, paddleShadow]) object.position.x = paddleX;
    paddleBody.scale.x = paddleScale; paddleLight.scale.x = paddleScale; paddleShadow.scale.x = paddleScale;
    energyRail.scale.x = Math.max(0.01, state.energy / 100);
    paddleLightMaterial.color.setHex(state.pulseArmed > 0 ? 0xe3ff75 : state.pulseCharge > 0 ? 0xffd56c : 0x9bffea);
    let shadowIndex = 0, trailIndex = 0;
    for (let index = 0; index < ballMeshes.length; index++) {
      const object = ballMeshes[index], ball = state.balls[index];
      const waiting = index === 0 && state.balls.length === 0 && state.status === "playing" && state.stageClearTicks === 0;
      object.visible = !!ball || waiting;
      if (!object.visible) continue;
      const x = ball ? lerp(ball.prevX, ball.x, interpolation) : paddleX;
      const z = ball ? lerp(ball.prevY, ball.y, interpolation) : BOARD.paddleY - 0.55;
      object.position.set(x, 0.29, z); object.material = state.pulseArmed > 0 ? ballCharged : ballWhite;
      dummy.position.set(x, 0.014, z + 0.07); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); ballShadows.setMatrixAt(shadowIndex++, dummy.matrix);
      if (ball && !options.reducedMotion) for (let point = 0; point < ball.trail.length; point++) {
        const fade = (point + 1) / ball.trail.length, position = ball.trail[point];
        setInstance(trails, trailIndex++, position.x, 0.25, position.y, fade, fade, fade);
      }
    }
    ballShadows.count = shadowIndex; ballShadows.instanceMatrix.needsUpdate = true;
    trails.count = trailIndex; trails.instanceMatrix.needsUpdate = true;
    const sparkCount = options.reducedMotion ? 0 : state.particles.length;
    sparks.count = sparkCount;
    for (let index = 0; index < sparkCount; index++) {
      const particle = state.particles[index], fade = Math.min(1, particle.life / 10), size = particle.size * fade;
      setInstance(sparks, index, particle.x, particle.z, particle.y, size, size, size, particle.life * 0.19);
      sparks.setColorAt(index, tint.setHex(particle.color).multiplyScalar(0.5 + particle.life / particle.maxLife * 0.5));
    }
    sparks.instanceMatrix.needsUpdate = true; if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    for (let index = 0; index < bursts.length; index++) {
      const object = bursts[index], effect = state.bursts[index]; object.visible = !!effect;
      if (!effect) continue;
      const progress = 1 - effect.life / effect.maxLife, scale = effect.radius * (options.reducedMotion ? 0.9 : 0.3 + progress * 0.7);
      object.position.set(effect.x, 0.06, effect.y); object.scale.set(scale, 1, scale);
      const surface = object.material as THREE.MeshBasicMaterial; surface.color.setHex(effect.color); surface.opacity = (1 - progress) * (options.reducedMotion ? 0.3 : 0.75);
    }
    pulseHalo.visible = state.pulseCharge > 0 || state.pulseArmed > 0;
    const lead = state.balls[0];
    pulseHalo.position.set(lead ? lead.x : paddleX, 0.04, lead ? lead.y : BOARD.paddleY - 0.55);
    const haloSize = state.pulseCharge > 0 ? 0.36 + state.pulseCharge / 100 : 0.4;
    pulseHalo.scale.set(haloSize, 1, haloSize);
    pulseHaloMaterial.opacity = options.reducedMotion ? 0.65 : 0.6 + Math.sin(state.tick * 0.12) * 0.2;
    for (let index = 0; index < pickups.length; index++) {
      const object = pickups[index], drop = state.drops[index]; object.group.visible = !!drop;
      if (!drop) continue;
      object.group.position.set(drop.x, 0.55 + (options.reducedMotion ? 0 : Math.sin(drop.age * 0.08) * 0.11), drop.y);
      object.group.rotation.y = options.reducedMotion ? 0 : drop.age * 0.025;
      object.surface.color.setHex(DROP_COLORS[drop.kind]);
      object.core.scale.setScalar(drop.kind === "multiball" ? 0.85 : 1);
      object.bar.visible = drop.kind === "wide"; object.ring.visible = drop.kind !== "multiball";
    }
  }

  return {
    update, resize,
    aimAt(x, y) {
      raycaster.setFromCamera(new THREE.Vector2(clamp(x, -1, 1), clamp(-y, -1, 1)), stage.camera);
      if (!raycaster.ray.intersectPlane(groundPlane, aimPoint)) return { aimX: 0, aimY: 0 };
      const limit = BOARD.halfWidth - state.paddle.halfWidth - 0.06;
      return { aimX: Math.round(clamp(aimPoint.x / limit, -1, 1) * 127), aimY: 0 };
    },
    dispose() {
      if (disposed) return;
      disposed = true; stage.scene.remove(root);
      for (const object of [footings, casings, seams, vents, tops, glyphBars, glyphRings, glyphDiamonds, ballShadows, trails, sparks]) object.dispose();
      for (const shape of geometries) shape.dispose();
      for (const surface of materials) surface.dispose();
      for (const texture of textures) texture.dispose();
      root.clear();
    },
  };
}

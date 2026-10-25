import * as THREE from "three";
import type { ArcadeView, ThreeStage, VisualOptions } from "../../shared/contracts";
import { BALL_RADIUS, BUMPERS, RAILS, RAMP_LENGTH, TARGETS, rampPoint, type PinballState } from "./model";

const C = { ink: 0x071625, black: 0x030713, cyan: 0x63fff3, violet: 0xa779ff, pink: 0xff54bd, gold: 0xffd36d, white: 0xecffff };
const vector = (x: number, y: number, z: number) => new THREE.Vector3(x, -y, z);

/** All play mechanisms are meshes in a common table plane, with elevation in Z. */
export function createView(stage: ThreeStage, state: PinballState): ArcadeView {
  const root = new THREE.Group(); root.name = "MIDNIGHT PINBALL"; stage.scene.add(root);
  const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>(), textures = new Set<THREE.Texture>();
  const material = (color: number, emissive = 0x000000, intensity = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.36, metalness: 0.32 }); materials.add(m); return m;
  };
  const bed = material(C.ink), rail = material(0x263e59, C.cyan, 0.12), chrome = material(0xc6dfed), dark = material(C.black), cyan = material(C.cyan, C.cyan, 1.25), pink = material(C.pink, C.pink, 1), violet = material(C.violet, C.violet, 0.6), gold = material(C.gold, C.gold, 0.8);
  const mesh = <T extends THREE.BufferGeometry>(geometry: T, mat: THREE.Material, parent: THREE.Object3D = root) => { geometries.add(geometry); const m = new THREE.Mesh(geometry, mat); parent.add(m); return m; };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) => { const o = mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.copy(vector(x, y, z)); return o; };
  const disk = (x: number, y: number, z: number, radius: number, depth: number, mat: THREE.Material) => { const o = mesh(new THREE.CylinderGeometry(radius, radius, depth, 28), mat); o.rotation.x = Math.PI / 2; o.position.copy(vector(x, y, z)); return o; };
  const line = (points: THREE.Vector3[], radius: number, mat: THREE.Material, parent: THREE.Object3D = root) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, "centripetal"), Math.max(1, points.length * 3), radius, 7, false), mat, parent);
  const straight = (ax: number, ay: number, bx: number, by: number, z: number, radius: number, mat: THREE.Material) => line([vector(ax, ay, z), vector(bx, by, z)], radius, mat);
  const ring = (x: number, y: number, z: number, radius: number, mat: THREE.Material, tube = 0.035) => { const o = mesh(new THREE.TorusGeometry(radius, tube, 7, 36), mat); o.position.copy(vector(x, y, z)); return o; };
  function label(text: string, x: number, y: number, z: number, width: number, height: number, color = "#b6e7ee", fontSize = 48) {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 192;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = color; context.font = `700 ${fontSize}px ui-monospace, monospace`; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, 512, 96, 1000);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }); materials.add(mat);
    const o = mesh(new THREE.PlaneGeometry(width, height), mat); o.position.copy(vector(x, y, z)); return o;
  }
  const ambient = new THREE.AmbientLight(0xb2c4ff, 1.5), key = new THREE.DirectionalLight(0xe4faff, 2.4), fill = new THREE.DirectionalLight(0xbb77ff, 1.2);
  key.position.set(-5, 6, 18); fill.position.set(7, -6, 8); root.add(ambient, key, fill);
  // Physical cabinet, inset playfield, and a luminous apron.
  box(0, 0.05, -0.59, 9.8, 15.4, 1.05, dark);
  box(0, 0, -0.065, 9.1, 14.65, 0.14, bed);
  box(-4.72, 0, 0.1, 0.32, 15.15, 0.5, rail); box(4.72, 0, 0.1, 0.32, 15.15, 0.5, rail);
  box(0, -7.38, 0.1, 9.8, 0.32, 0.5, rail); box(0, 7.3, 0.15, 9.8, 0.48, 0.55, dark);
  straight(-4.88, -7.5, -4.88, 7.47, 0.13, 0.035, violet); straight(4.88, -7.5, 4.88, 7.47, 0.13, 0.035, cyan);
  straight(-4.8, 7.55, 4.8, 7.55, 0.15, 0.03, pink);
  // Deliberately sparse artwork keeps the steel ball and mechanisms legible.
  for (let i = 0; i < 10; i++) straight(-4.32, -6.7 + i * 1.34, 3.43, -6.7 + i * 1.34, 0.018, 0.008, material(0x143444));
  for (let i = 0; i < 6; i++) straight(-3.9 + i * 1.35, -6.8, -3.9 + i * 1.35, 6.65, 0.019, 0.007, material(0x12313e));
  label("M I D N I G H T", -0.2, 0.25, 0.035, 5.6, 0.85, "#bdfcf1", 66);
  label("P I N B A L L", -0.2, 0.85, 0.036, 3.1, 0.48, "#c6a2ff", 54);
  label("AFTER HOURS SOCIAL CLUB", -0.12, 6.55, 0.035, 5.7, 0.48, "#819aaf", 42);
  label("01", -2.45, -6.55, 0.04, 0.75, 0.32, "#ffd36d"); label("02", -0.15, -6.65, 0.04, 0.75, 0.32, "#ffd36d"); label("03", 2.15, -6.55, 0.04, 0.75, 0.32, "#ffd36d");
  label("SHOOT", -2.77, -0.06, 0.04, 1.1, 0.32, "#be9fff", 44);
  label("RAMP", -2.77, 0.25, 0.04, 1.1, 0.32, "#be9fff", 44);
  for (let i = 0; i < 3; i++) {
    const y = -0.4 + i * 0.31;
    straight(-2.99, y + 0.14, -2.75, y, 0.045, 0.028, violet); straight(-2.75, y, -2.51, y + 0.14, 0.045, 0.028, violet);
  }
  for (const r of RAILS) {
    if (r.sling !== undefined) continue;
    straight(r.ax, r.ay, r.bx, r.by, 0.21, 0.065, chrome);
    disk(r.ax, r.ay, 0.13, 0.09, 0.24, rail); disk(r.bx, r.by, 0.13, 0.09, 0.24, rail);
  }
  const bumperCaps: THREE.Mesh[] = [], bumperRings: THREE.Mesh[] = [];
  BUMPERS.forEach((b, i) => {
    disk(b.x, b.y, 0.08, b.radius + 0.16, 0.12, dark); ring(b.x, b.y, 0.15, b.radius + 0.11, violet);
    disk(b.x, b.y, 0.23, b.radius, 0.28, chrome);
    const cap = disk(b.x, b.y, 0.41, b.radius * 0.86, 0.12, material(i === 2 ? C.pink : C.cyan, i === 2 ? C.pink : C.cyan, 0.35)); bumperCaps.push(cap);
    bumperRings.push(ring(b.x, b.y, 0.49, b.radius * 0.66, i === 2 ? pink : cyan, 0.035));
    disk(b.x, b.y, 0.49, b.radius * 0.25, 0.07, dark);
    label(["100", "100", "100"][i], b.x, b.y + 0.03, 0.54, 0.6, 0.27, "#edffff", 48);
  });
  const targetLamps: THREE.Mesh[] = [];
  TARGETS.forEach(t => {
    box(t.x, t.y, 0.16, 0.72, 0.5, 0.28, rail); box(t.x, t.y - 0.13, 0.33, 0.62, 0.18, 0.3, chrome);
    const targetMat = material(0x66543a, C.gold, 0.1);
    targetLamps.push(disk(t.x, t.y + 0.12, 0.34, 0.215, 0.09, targetMat)); ring(t.x, t.y + 0.12, 0.4, 0.23, gold, 0.02);
    // A true geometric five-point star, rather than a sprite.
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? 0.064 : 0.145; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0) star.moveTo(x, y); else star.lineTo(x, y); } star.closePath();
    const o = mesh(new THREE.ExtrudeGeometry(star, { depth: 0.018, bevelEnabled: false }), gold); o.position.copy(vector(t.x, t.y + 0.12, 0.405));
  });
  const slingCaps: THREE.Mesh[] = [];
  for (const side of [0, 1]) {
    const triangle = RAILS.filter(r => r.sling === side), shape = new THREE.Shape();
    triangle.forEach((r, i) => { if (!i) shape.moveTo(r.ax, -r.ay); shape.lineTo(r.bx, -r.by); }); shape.closePath();
    const mat = material(0x362650, C.violet, 0.18); slingCaps.push(mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.23, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 1 }), mat));
    triangle.forEach(r => straight(r.ax, r.ay, r.bx, r.by, 0.29, 0.048, violet));
    for (const r of triangle) { disk(r.ax, r.ay, 0.25, 0.12, 0.45, chrome); disk(r.ax, r.ay, 0.49, 0.07, 0.04, cyan); }
  }
  // Transparent elevated ramp bed plus twin steel rails and physical supports.
  const positions: number[] = [], indices: number[] = [], railLeft: THREE.Vector3[] = [], railRight: THREE.Vector3[] = [];
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x6c69bd, emissive: C.violet, emissiveIntensity: 0.15, transparent: true, opacity: 0.38, side: THREE.DoubleSide, roughness: 0.25, metalness: 0.25, depthWrite: false }); materials.add(rampMat);
  for (let i = 0; i <= 100; i++) {
    const p = rampPoint(i / 100 * RAMP_LENGTH), flat = Math.hypot(p.tx, p.ty), nx = -p.ty / flat, ny = p.tx / flat;
    for (const side of [-1, 1]) { const v = vector(p.x + nx * 0.46 * side, p.y + ny * 0.46 * side, p.z - BALL_RADIUS + 0.015); positions.push(v.x, v.y, v.z); (side === -1 ? railLeft : railRight).push(v.clone().add(new THREE.Vector3(0, 0, 0.19))); }
    if (i < 100) { const v = i * 2; indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const rampGeometry = new THREE.BufferGeometry(); rampGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); rampGeometry.setIndex(indices); rampGeometry.computeVertexNormals(); mesh(rampGeometry, rampMat);
  line(railLeft, 0.035, chrome); line(railRight, 0.035, chrome);
  for (const t of [0.2, 0.4, 0.62, 0.8]) { const p = rampPoint(t * RAMP_LENGTH); const support = disk(p.x, p.y, (p.z - 0.18) / 2, 0.055, Math.max(0.1, p.z - 0.18), rail); support.name = "ramp support"; ring(p.x, p.y, 0.04, 0.15, violet, 0.015); }
  label("SKYLINE", -0.55, -5.46, 2.3, 1.9, 0.4, "#ddd0ff", 52);
  const lockLamp = disk(-2.75, -0.45, 0.045, 0.16, 0.035, material(C.violet, C.violet, 0.1));
  const flippers: THREE.Group[] = [];
  state.flippers.forEach((f, index) => {
    const group = new THREE.Group(); root.add(group); flippers.push(group);
    const mat = material(index ? C.pink : C.cyan, index ? C.pink : C.cyan, 0.22);
    const bar = mesh(new THREE.BoxGeometry(f.length, 0.265, 0.22), mat, group); bar.position.set(f.length / 2, 0, 0.18);
    for (const x of [0, f.length]) { const cap = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 20), mat, group); cap.rotation.x = Math.PI / 2; cap.position.set(x, 0, 0.18); }
    const inset = mesh(new THREE.BoxGeometry(1.55, 0.07, 0.035), chrome, group); inset.position.set(0.95, 0, 0.31);
    disk(f.x, f.y, 0.14, 0.24, 0.2, rail); disk(f.x, f.y, 0.32, 0.1, 0.08, chrome);
  });
  const plunger = box(4.03, 6.93, 0.17, 0.5, 0.22, 0.27, gold);
  for (let i = 0; i < 6; i++) ring(4.03, 7.02 + i * 0.06, 0.2, 0.12, chrome, 0.015).rotation.x = Math.PI / 2;
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xf4ffff, emissive: 0xaccfdd, emissiveIntensity: 0.08, metalness: 0.92, roughness: 0.14 }); materials.add(ballMat);
  const balls = Array.from({ length: 3 }, () => mesh(new THREE.SphereGeometry(BALL_RADIUS, 20, 14), ballMat));
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x00010a, transparent: true, opacity: 0.65, depthWrite: false }); materials.add(shadowMat);
  const shadows = Array.from({ length: 3 }, () => mesh(new THREE.CircleGeometry(BALL_RADIUS * 1.3, 16), shadowMat));
  const ballRings = Array.from({ length: 3 }, () => ring(0, 0, 0.025, BALL_RADIUS * 1.8, cyan, 0.012));
  const particleMat = new THREE.MeshBasicMaterial({ color: C.cyan }); materials.add(particleMat);
  const particles = Array.from({ length: 30 }, () => ({ mesh: mesh(new THREE.SphereGeometry(0.035, 5, 4), particleMat), life: 0, vx: 0, vy: 0, vz: 0 }));
  particles.forEach(p => { p.mesh.visible = false; }); let lastSerial = state.hitSerial, lastTick = state.tick;
  const saveLamp = ring(0, 5.98, 0.035, 0.27, material(C.gold, C.gold, 0.15), 0.035);
  label("SAVE", 0, 6.02, 0.045, 0.57, 0.23, "#ffdc9f", 42);
  const camera = stage.camera;
  camera.up.set(0, 1, 0); camera.position.set(0, -7.4, 28); camera.lookAt(0, 0, 0); camera.near = 0.1; camera.far = 100;
  let width = stage.width, height = stage.height;
  function resize(w: number, h: number) {
    width = Math.max(1, w); height = Math.max(1, h);
    // Fit the projected cabinet plus ramp height at every viewport ratio.
    const aspect = width / height, visibleHeight = Math.max(16.3, 10.6 / aspect);
    camera.left = -visibleHeight * aspect / 2; camera.right = visibleHeight * aspect / 2; camera.top = visibleHeight / 2; camera.bottom = -visibleHeight / 2; camera.updateProjectionMatrix();
  }
  resize(width, height);
  return {
    resize,
    update(alpha: number, options: VisualOptions) {
      const t = Math.max(0, Math.min(1, alpha)), advanced = state.tick !== lastTick;
      if (options.highContrast) { bed.color.setHex(0x020913); rail.color.setHex(0x7497b6); }
      else { bed.color.setHex(C.ink); rail.color.setHex(0x263e59); }
      for (let i = 0; i < 3; i++) {
        const b = state.balls[i]; balls[i].visible = shadows[i].visible = ballRings[i].visible = Boolean(b);
        if (b) {
          const x = b.px + (b.x - b.px) * t, y = b.py + (b.y - b.py) * t, z = b.pz + (b.z - b.pz) * t;
          balls[i].position.copy(vector(x, y, z)); shadows[i].position.copy(vector(x, y, 0.027)); shadows[i].scale.setScalar(1 + Math.min(1, z * 0.2));
          ballRings[i].position.copy(vector(x, y, Math.max(0.029, z - BALL_RADIUS + 0.01))); ballRings[i].visible = options.highContrast;
        }
        (bumperCaps[i].material as THREE.MeshStandardMaterial).emissiveIntensity = state.bumperFlash[i] > 0 ? 2.5 : 0.35;
        bumperCaps[i].position.z = 0.41 - (state.bumperFlash[i] > 0 ? 0.04 : 0);
        (targetLamps[i].material as THREE.MeshStandardMaterial).emissiveIntensity = state.targetFlash[i] > 0 ? 3 : (state.targetBits & (1 << i)) ? 1.5 : 0.06;
        (targetLamps[i].material as THREE.MeshStandardMaterial).color.setHex(state.targetBits & (1 << i) ? C.gold : 0x66543a);
      }
      state.flippers.forEach((f, i) => { flippers[i].position.copy(vector(f.x, f.y, 0)); flippers[i].rotation.z = -(f.previousAngle + (f.angle - f.previousAngle) * t); });
      slingCaps.forEach((s, i) => { (s.material as THREE.MeshStandardMaterial).emissiveIntensity = state.slingFlash[i] ? 1.2 : 0.18; });
      (lockLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = state.targetBits === 7 || state.multiball ? 2 : 0.12;
      (saveLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = state.ballSaveUntil > state.tick ? 1.7 : 0.08;
      plunger.position.y = -6.93 - state.plungerCharge * 0.24;
      if (advanced && state.hitSerial !== lastSerial && !options.reducedMotion) {
        let count = 0;
        for (const p of particles) if (p.life <= 0 && count < 8) { const angle = count / 8 * Math.PI * 2 + state.hitSerial; p.life = 16; p.mesh.position.copy(vector(state.lastHit.x, state.lastHit.y, state.lastHit.z + 0.1)); p.vx = Math.cos(angle) * 0.045; p.vy = Math.sin(angle) * 0.045; p.vz = 0.035; p.mesh.visible = true; count++; }
      }
      if (advanced) for (const p of particles) { if (options.reducedMotion) p.life = 0; if (p.life > 0) { p.life--; p.mesh.position.x += p.vx; p.mesh.position.y += p.vy; p.mesh.position.z += p.vz; p.vz -= 0.004; p.mesh.scale.setScalar(p.life / 16); } p.mesh.visible = p.life > 0; }
      lastTick = state.tick; lastSerial = state.hitSerial;
    },
    dispose() { stage.scene.remove(root); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); root.clear(); },
  };
}

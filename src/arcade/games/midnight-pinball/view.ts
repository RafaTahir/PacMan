import * as THREE from "three";
import hibiscus from "./assets/hibiscus.json";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ArcadeView, ThreeStage, VisualOptions } from "../../shared/contracts";
import { BALL_RADIUS, BUMPERS, RAILS, RAMP_LENGTH, RIVER_LENGTH, TARGETS, rampPoint, riverPoint, type PinballState } from "./model";

const C = { ink: 0x083d37, black: 0x091e20, cyan: 0x68ffdb, violet: 0xffba62, pink: 0xff776c, gold: 0xffd36d, white: 0xecffff };
const vector = (x: number, y: number, z: number) => new THREE.Vector3(x, -y, z);

/** All play mechanisms are meshes in a common table plane, with elevation in Z. */
export function createView(stage: ThreeStage, state: PinballState): ArcadeView {
  const root = new THREE.Group(); root.name = "MIDNIGHT PINBALL"; stage.scene.add(root);
  const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>(), textures = new Set<THREE.Texture>();
  const material = (color: number, emissive = 0x000000, intensity = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.36, metalness: 0.32 }); materials.add(m); return m;
  };
  const bed = material(0x083d37), rail = material(0x263e59, C.cyan, 0.12), chrome = material(0xc6dfed), dark = material(C.black), cyan = material(C.cyan, C.cyan, 1.25), pink = material(C.pink, C.pink, 1), violet = material(C.violet, C.violet, 0.6), gold = material(C.gold, C.gold, 0.8);
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
  const ambient = new THREE.AmbientLight(0xb5eddf, 1.5), key = new THREE.DirectionalLight(0xffefd5, 2.4), fill = new THREE.DirectionalLight(0x64dcb5, 1.2);
  key.position.set(-5, 6, 18); fill.position.set(7, -6, 8); root.add(ambient, key, fill);
  // Physical cabinet, inset playfield, and a luminous apron.
  box(0, 0.05, -0.59, 9.8, 15.4, 1.05, dark);
  box(0, 0, -0.065, 9.1, 14.65, 0.14, bed);
  box(-4.72, 0, 0.1, 0.32, 15.15, 0.5, rail); box(4.72, 0, 0.1, 0.32, 15.15, 0.5, rail);
  box(0, -7.38, 0.1, 9.8, 0.32, 0.5, rail); box(0, 7.3, 0.15, 9.8, 0.48, 0.55, dark);
  straight(-4.88, -7.5, -4.88, 7.47, 0.13, 0.035, violet); straight(4.88, -7.5, 4.88, 7.47, 0.13, 0.035, cyan);
  straight(-4.8, 7.55, 4.8, 7.55, 0.15, 0.03, pink);
  // One original batik-inspired playfield texture keeps decoration inexpensive.
  // Every physical mechanism remains independent depth-tested mesh geometry.
  const art = document.createElement("canvas"); art.width = 768; art.height = 1280;
  const brush = art.getContext("2d");
  if (brush) {
    const grad = brush.createLinearGradient(0, 0, 768, 1280); grad.addColorStop(0, "#125c50"); grad.addColorStop(0.6, "#063f3b"); grad.addColorStop(1, "#07322e");
    brush.fillStyle = grad; brush.fillRect(0, 0, 768, 1280);
    // Hand-drawn river, shoreline and contour rings under the wireform routes.
    brush.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      brush.beginPath(); brush.moveTo(600 + i * 9, 1100); brush.bezierCurveTo(500 + i * 10, 850, 650 + i * 7, 600, 530 + i * 9, 310); brush.bezierCurveTo(420 + i * 6, 100, 230, 70 + i * 10, 120, 240);
      brush.strokeStyle = i % 2 ? "#187169" : "#0d5d57"; brush.lineWidth = 12; brush.stroke();
    }
    for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
      const x = side < 0 ? 36 + (i % 2) * 13 : 730 - (i % 2) * 13, y = 70 + i * 145;
      brush.save(); brush.translate(x, y); brush.rotate(side * 0.55);
      brush.fillStyle = i % 2 ? "#336b4d" : "#527b4a";
      brush.beginPath(); brush.moveTo(0, -36); brush.bezierCurveTo(65, -38, 61, 27, 0, 48); brush.bezierCurveTo(-9, 23, -12, -15, 0, -36); brush.fill();
      brush.strokeStyle = "#97a15d"; brush.lineWidth = 2; brush.beginPath(); brush.moveTo(0, -28); brush.lineTo(0, 38); brush.stroke(); brush.restore();
    }
    // A restrained repeating diamond weave around the apron, inspired by ketupat.
    brush.strokeStyle = "#8b9763"; brush.lineWidth = 2;
    for (let y = 1150; y < 1270; y += 28) for (let x = 140; x < 630; x += 28) { brush.beginPath(); brush.moveTo(x, y - 11); brush.lineTo(x + 11, y); brush.lineTo(x, y + 11); brush.lineTo(x - 11, y); brush.closePath(); brush.stroke(); }
    const texture = new THREE.CanvasTexture(art); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const artMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.05 }); materials.add(artMat);
    const floor = mesh(new THREE.PlaneGeometry(8.85, 14.35), artMat); floor.position.z = 0.009;
  }
  const leaf = material(0x46ac72, 0x075932, 0.15), trunk = material(0x9f7045), coral = material(0xff746e, 0xff4034, 0.25);
  const frondGeometry = new THREE.SphereGeometry(0.17, 8, 6), lanternGeometry = new THREE.SphereGeometry(0.14, 10, 8);
  // Sculpted palms stand on the cabinet rails, outside every ball trajectory.
  for (const side of [-1, 1]) {
    const x = side * 4.62;
    for (const y of [-4.7, 2.5]) {
      disk(x, y, 0.55, 0.11, 0.75, trunk);
      for (let i = 0; i < 6; i++) {
        const frond = mesh(frondGeometry, leaf), angle = i * Math.PI / 3;
        frond.scale.set(2.6, 0.62, 0.36); frond.rotation.z = angle;
        frond.position.copy(vector(x + Math.cos(angle) * 0.23, y + Math.sin(angle) * 0.23, 1.0));
      }
    }
    for (const y of [-6.0, -2.5, 0.5, 4.9]) {
      const lantern = mesh(lanternGeometry, coral); lantern.scale.set(1, 1.2, 1);
      lantern.position.copy(vector(x, y, 0.65)); disk(x, y, 0.83, 0.075, 0.03, gold);
    }
  }
  // A tiny pasar malam roof crowns the target bank without hiding the shots.
  box(0, -7.28, 0.58, 5.2, 0.25, 0.15, trunk);
  for (let i = 0; i < 9; i++) { const tile = box(-2.32 + i * 0.58, -7.28, 0.78, 0.56, 0.42, 0.1, i % 2 ? gold : coral); tile.rotation.x = -0.1; }
  label("P U L A U", -0.3, 0.3, 0.035, 3.5, 0.72, "#b6c997", 66);
  label("M A L A Y S I A", -0.3, 0.86, 0.036, 2.9, 0.42, "#b6c997", 54);
  label("PASAR MALAM • NIGHT MARKET", -0.12, 6.55, 0.035, 6.3, 0.48, "#c0b575", 42);
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
  const hibiscusGeometry = new THREE.BufferGeometry();
  hibiscusGeometry.setAttribute("position", new THREE.Float32BufferAttribute(hibiscus.positions, 3));
  hibiscusGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(hibiscus.normals, 3));
  BUMPERS.forEach((b, i) => {
    disk(b.x, b.y, 0.08, b.radius + 0.16, 0.12, dark); ring(b.x, b.y, 0.15, b.radius + 0.11, violet);
    disk(b.x, b.y, 0.23, b.radius, 0.28, chrome);
    const cap = disk(b.x, b.y, 0.41, b.radius * 0.86, 0.12, material(i === 2 ? C.pink : C.cyan, i === 2 ? C.pink : C.cyan, 0.35)); bumperCaps.push(cap);
    bumperRings.push(ring(b.x, b.y, 0.49, b.radius * 0.66, i === 2 ? pink : cyan, 0.035));
    // Original Blender-authored five-petal mesh; shared and batched with the table.
    const flower = mesh(hibiscusGeometry, i === 2 ? gold : coral);
    flower.position.copy(vector(b.x, b.y, 0.52)); flower.scale.setScalar(0.8);
    disk(b.x, b.y, 0.56, b.radius * 0.17, 0.07, gold);
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
  const riverLeft: THREE.Vector3[] = [], riverRight: THREE.Vector3[] = [], riverPositions: number[] = [], riverIndices: number[] = [];
  for (let i = 0; i <= 80; i++) {
    const p = riverPoint(i / 80 * RIVER_LENGTH), flat = Math.hypot(p.tx, p.ty), nx = -p.ty / flat, ny = p.tx / flat;
    for (const side of [-1, 1]) {
      const v = vector(p.x + nx * 0.33 * side, p.y + ny * 0.33 * side, p.z - BALL_RADIUS + 0.01);
      riverPositions.push(v.x, v.y, v.z); (side === -1 ? riverLeft : riverRight).push(v.clone().add(new THREE.Vector3(0, 0, 0.16)));
    }
    if (i < 80) { const v = i * 2; riverIndices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const riverGeometry = new THREE.BufferGeometry(); riverGeometry.setAttribute("position", new THREE.Float32BufferAttribute(riverPositions, 3)); riverGeometry.setIndex(riverIndices); riverGeometry.computeVertexNormals();
  const riverMat = new THREE.MeshStandardMaterial({ color: C.cyan, transparent: true, opacity: 0.32, side: THREE.DoubleSide, roughness: 0.22, metalness: 0.1, depthWrite: false }); materials.add(riverMat); mesh(riverGeometry, riverMat);
  line(riverLeft, 0.028, chrome); line(riverRight, 0.028, cyan);
  for (const t of [0.2, 0.45, 0.7]) { const p = riverPoint(t * RIVER_LENGTH); disk(p.x, p.y, (p.z - 0.15) / 2, 0.045, Math.max(0.1, p.z - 0.15), trunk); }
  label("RIVER", 2.75, 0.08, 0.045, 1.18, 0.3, "#98f5d4", 48);
  for (let i = 0; i < 3; i++) { const y = -0.4 + i * 0.31; straight(2.55, y + 0.12, 2.75, y, 0.045, 0.025, cyan); straight(2.75, y, 2.95, y + 0.12, 0.045, 0.025, cyan); }
  const tourLamps = [disk(-0.6, 1.55, 0.03, 0.16, 0.04, material(C.gold, C.gold, 0.05)), disk(0.6, 1.55, 0.03, 0.16, 0.04, material(C.cyan, C.cyan, 0.05))];
  label("RAMP + RIVER = ISLAND TOUR", 0, 2.05, 0.035, 4, 0.3, "#b6c997", 44);
  label("ISLAND RUN", -0.55, -5.46, 2.3, 1.9, 0.4, "#ddd0ff", 52);
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
  // Bake only immutable, opaque, direct table meshes. Each material becomes
  // one draw call; animated mechanisms and transparent layers remain separate.
  // Keeping material identities preserves live high-contrast color updates.
  const dynamic = new Set<THREE.Object3D>([
    ...bumperCaps, ...targetLamps, ...slingCaps, ...tourLamps, lockLamp,
    saveLamp, plunger, ...balls, ...shadows, ...ballRings, ...particles.map(p => p.mesh),
  ]);
  const batches = new Map<THREE.Material, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  for (const child of root.children) {
    if (!(child instanceof THREE.Mesh) || dynamic.has(child) || Array.isArray(child.material) || child.material.transparent) continue;
    const group = batches.get(child.material) ?? []; group.push(child); batches.set(child.material, group);
  }
  for (const [mat, group] of batches) {
    if (group.length < 2) continue;
    const parts = group.map(object => {
      object.updateMatrix();
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrix); geometry.clearGroups();
      // Generated wireform beds have no UVs; none of these opaque materials
      // use maps, so retain only the shared position/normal attributes.
      for (const attribute of Object.keys(geometry.attributes)) if (attribute !== "position" && attribute !== "normal") geometry.deleteAttribute(attribute);
      return geometry;
    });
    const merged = mergeGeometries(parts, false);
    parts.forEach(part => part.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const combined = mesh(merged, mat); combined.name = "static tropical table batch";
    group.forEach(object => root.remove(object));
  }
  // Release original CPU/GPU buffers after replacing the meshes, excluding any
  // geometry still shared by a dynamic object or an unbatched transparent layer.
  const retained = new Set<THREE.BufferGeometry>();
  root.traverse(object => { if (object instanceof THREE.Mesh) retained.add(object.geometry); });
  for (const geometry of geometries) if (!retained.has(geometry)) { geometry.dispose(); geometries.delete(geometry); }
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
      else { bed.color.setHex(0x083d37); rail.color.setHex(0x263e59); }
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
      tourLamps.forEach((lamp, i) => { (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = state.tourBits & (1 << i) ? 1.8 : 0.05; });
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

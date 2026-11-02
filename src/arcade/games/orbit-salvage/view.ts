import * as THREE from "three";
import type { ArcadeSimulation, ArcadeView, ThreeStage } from "../../shared/contracts";
import type { OrbitState } from "./model";

/** Original salvage hardware. Fixed pools and shared buffers keep flight allocation-free. */
export function createView(stage: ThreeStage, simulation: ArcadeSimulation): ArcadeView {
  const s = simulation.state as OrbitState;
  const root = new THREE.Group();
  root.name = "ORBIT SALVAGE";
  stage.scene.add(root);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const geo = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value; };
  const surface = (color: number, emissive = 0, intensity = 0) => {
    const value = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: .42, metalness: .55 });
    materials.add(value); return value;
  };
  const basic = (color: number) => {
    const value = new THREE.MeshBasicMaterial({ color, toneMapped: false }); materials.add(value); return value;
  };
  const steel = surface(0x9aadc3), oreSurface = surface(0x625d78), denseSurface = surface(0x647e95);
  const volatileSurface = surface(0x77454c, 0x551323, .35);
  const gold = surface(0xffd46d, 0xe79326, .7), cyan = surface(0x5bffff, 0x00a4c7, 1);
  const violet = surface(0x765af3, 0x432ad6, .8), dark = surface(0x111a33);
  const red = surface(0xff546d, 0xff173a, .8), ink = basic(0x233e62), white = basic(0xeafaff);
  const boxGeometry = geo(new THREE.BoxGeometry(1, 1, 1));
  const ringGeometry = geo(new THREE.TorusGeometry(1, .045, 6, 32));
  function mesh(shape: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = root) {
    const object = new THREE.Mesh(shape, material); parent.add(object); return object;
  }
  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, parent: THREE.Object3D = root) {
    const object = mesh(boxGeometry, material, parent); object.position.set(x, y, z); object.scale.set(sx, sy, sz); return object;
  }
  function flatRing(x: number, y: number, z: number, radius: number, material: THREE.Material, parent: THREE.Object3D = root) {
    const object = mesh(ringGeometry, material, parent); object.position.set(x, y, z); object.rotation.x = Math.PI / 2; object.scale.setScalar(radius); return object;
  }
  function label(text: string, width: number, color: string) {
    const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 96;
    const context = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }); materials.add(material);
    const sprite = new THREE.Sprite(material); sprite.scale.set(width, width / 8, 1);
    const paint = (value: string) => {
      context.clearRect(0, 0, 768, 96);
      context.fillStyle = "rgba(5,12,30,.92)"; context.fillRect(0, 0, 768, 96);
      context.strokeStyle = color; context.lineWidth = 3; context.strokeRect(2, 2, 764, 92);
      context.font = "bold 31px monospace"; context.textAlign = "center"; context.textBaseline = "middle";
      context.fillStyle = color; context.fillText(value, 384, 48, 730); texture.needsUpdate = true;
    };
    paint(text); return { sprite, paint };
  }

  box(0, -.5, 0, 29, .3, 23, dark);
  for (const z of [-11.3, 11.3]) box(0, -.29, z, 28.5, .035, .045, cyan);
  for (const x of [-14.25, 14.25]) box(x, -.29, 0, .045, .035, 22.6, cyan);
  // Recessed survey rings and corner masts give the field depth without implying cover.
  for (const radius of [4, 7.5, 10.5]) {
    const survey = mesh(geo(new THREE.TorusGeometry(radius, .012, 4, 80)), ink);
    survey.position.y = -.32; survey.rotation.x = Math.PI / 2;
  }
  for (const x of [-14.6, 14.6]) for (const z of [-11.6, 11.6]) {
    box(x, .12, z, .42, 1.4, .42, steel);
    box(x, .86, z, .5, .08, .5, violet);
    flatRing(x, -.28, z, .65, ink);
  }
  const starPositions: number[] = [];
  for (let i = 0; i < 180; i++) starPositions.push(Math.sin(i * 127.3) * 14, -.3, Math.cos(i * 41.9) * 11);
  const stars = geo(new THREE.BufferGeometry()); stars.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0x9aace0, size: .045 }); materials.add(starMaterial);
  root.add(new THREE.Points(stars, starMaterial));

  const refinery = new THREE.Group(); root.add(refinery);
  const dockRing = flatRing(0, -.08, 0, 1.5, gold, refinery);
  flatRing(0, -.18, 0, 1.85, ink, refinery);
  const hub = mesh(geo(new THREE.CylinderGeometry(.65, .9, .3, 6)), steel, refinery); hub.position.y = -.2;
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const arm = box(Math.sin(angle) * 1.1, -.05, Math.cos(angle) * 1.1, .25, .12, .65, violet, refinery);
    arm.rotation.y = angle;
    const dock = box(Math.sin(angle) * 2, -.21, Math.cos(angle) * 2, .55, .14, .6, steel);
    dock.rotation.y = angle;
    const light = box(Math.sin(angle) * 2, -.12, Math.cos(angle) * 2, .35, .035, .3, gold);
    light.rotation.y = angle;
  }
  const refinerySign = label("REFINERY · SLOW TO BANK", 4.2, "#ffe1a0");
  refinerySign.sprite.position.set(0, .22, 2.65); root.add(refinerySign.sprite);
  const legend = label("GOLD: ORE   SILVER: DENSE   RED: VOLATILE", 8.5, "#b9d3e9");
  legend.sprite.position.set(0, .1, -10.8); root.add(legend.sprite);

  const ship = new THREE.Group(); root.add(ship);
  const hull = mesh(geo(new THREE.ConeGeometry(.36, 1, 4)), steel, ship); hull.rotation.x = -Math.PI / 2; hull.position.y = .22;
  box(0, .12, .2, .92, .12, .35, cyan, ship);
  const cockpit = mesh(geo(new THREE.SphereGeometry(.18, 10, 8)), violet, ship); cockpit.scale.set(1, .7, 1.5); cockpit.position.set(0, .35, -.05);
  const flame = mesh(geo(new THREE.ConeGeometry(.15, .6, 8)), gold, ship); flame.rotation.x = Math.PI / 2; flame.position.set(0, .16, .7);
  const shieldMaterial = new THREE.MeshBasicMaterial({ color: 0x72faff, transparent: true, opacity: .2, wireframe: true }); materials.add(shieldMaterial);
  const shield = mesh(geo(new THREE.IcosahedronGeometry(.76, 1)), shieldMaterial, ship); shield.position.y = .2;
  const modules = [new THREE.Group(), new THREE.Group(), new THREE.Group()]; modules.forEach(group => ship.add(group));
  for (const side of [-1, 1]) {
    // Tier one tractor vanes, tier two offset cannons, tier three shield fins.
    box(side * .59, .18, .13, .26, .09, .65, steel, modules[0]);
    box(side * .59, .24, .13, .17, .025, .49, violet, modules[0]);
    box(side * .4, .3, -.5, .17, .18, .62, steel, modules[1]);
    box(side * .4, .3, -.84, .14, .14, .075, gold, modules[1]);
    const fin = box(side * .65, .34, .45, .12, .55, .32, cyan, modules[2]); fin.rotation.z = -side * .35;
  }
  const cargoPods = Array.from({ length: 4 }, (_, index) => box((index % 2 ? 1 : -1) * .32, .29, .25 + Math.floor(index / 2) * .23, .22, .2, .18, gold, ship));

  const oreGeometry = geo(new THREE.IcosahedronGeometry(1, 1));
  const denseGeometry = geo(new THREE.DodecahedronGeometry(1, 0));
  const volatileGeometry = geo(new THREE.OctahedronGeometry(1, 0));
  const veinGeometry = geo(new THREE.OctahedronGeometry(.18));
  const rocks = Array.from({ length: 38 }, () => {
    const group = new THREE.Group(); root.add(group);
    const body = mesh(oreGeometry, oreSurface, group);
    const veins = new THREE.Group(); group.add(veins);
    for (const side of [-1, 1]) { const vein = mesh(veinGeometry, gold, veins); vein.position.set(side * .52, .63, side * .25); }
    const band = mesh(ringGeometry, steel, group); band.scale.setScalar(.96); band.rotation.x = .7;
    const core = mesh(veinGeometry, red, group); core.position.y = .72; core.scale.setScalar(1.6);
    return { group, body, veins, band, core };
  });
  const shotGeometry = geo(new THREE.CapsuleGeometry(.055, .35, 2, 4));
  const shots = Array.from({ length: 34 }, () => mesh(shotGeometry, cyan));
  const ore = Array.from({ length: 48 }, () => mesh(veinGeometry, gold));

  const wreck = new THREE.Group(); root.add(wreck);
  box(0, .25, 0, .8, .5, .9, steel, wreck);
  box(0, .52, 0, .54, .06, .66, violet, wreck);
  box(0, .56, 0, .14, .035, .44, gold, wreck);
  box(0, .56, 0, .44, .035, .14, gold, wreck);
  for (const side of [-1, 1]) {
    const brokenPanel = box(side * .58, .22, 0, .4, .08, .72, dark, wreck); brokenPanel.rotation.z = side * .3;
    box(side * .58, .28, 0, .28, .025, .5, cyan, wreck);
  }
  const wreckRing = flatRing(0, .03, 0, 1.05, gold, wreck);
  const towCue = label("HOLD SHIELD TO TOW", 4.4, "#ffe1a0"); wreck.add(towCue.sprite); towCue.sprite.position.set(0, 1.15, 0);
  const tetherMaterial = new THREE.MeshBasicMaterial({ color: 0x9fffe2, transparent: true, opacity: .75, toneMapped: false }); materials.add(tetherMaterial);
  const tether = box(0, .25, 0, .035, .035, 1, tetherMaterial);
  const refineryArrow = new THREE.Group(); root.add(refineryArrow);
  const arrow = mesh(geo(new THREE.ConeGeometry(.2, .55, 3)), gold, refineryArrow); arrow.rotation.x = Math.PI / 2;
  const arrowBase = flatRing(0, 0, 0, .32, ink, refineryArrow); arrowBase.scale.set(.32, .32, .32);
  let towSignature = "";

  const hit = mesh(geo(new THREE.TorusGeometry(.5, .05, 6, 20)), red); hit.rotation.x = Math.PI / 2;
  let previousSerial = s.hitSerial, hitUntil = 0, disposed = false;
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point = new THREE.Vector3();
  stage.camera.position.set(0, 27, 12); stage.camera.up.set(0, 1, 0); stage.camera.lookAt(0, 0, 0);
  function resize(width: number, height: number) {
    const aspect = Math.max(1, width) / Math.max(1, height), visibleHeight = Math.max(25, 31 / aspect);
    stage.camera.left = -visibleHeight * aspect / 2; stage.camera.right = visibleHeight * aspect / 2;
    stage.camera.top = visibleHeight / 2; stage.camera.bottom = -visibleHeight / 2;
    stage.camera.updateProjectionMatrix(); stage.camera.updateMatrixWorld();
  }
  resize(stage.width, stage.height);
  return {
    resize,
    aimAt(x, y) {
      pointer.set(x, -y); ray.setFromCamera(pointer, stage.camera);
      if (ray.ray.intersectPlane(ground, point)) {
        const dx = point.x - s.player.x, dy = point.z - s.player.y, length = Math.hypot(dx, dy) || 1;
        return { aimX: dx / length * 127, aimY: dy / length * 127 };
      }
      return { aimX: 0, aimY: -127 };
    },
    update(_alpha, options) {
      if (disposed) return;
      const p = s.player;
      ship.position.set(p.x, 0, p.y); ship.rotation.y = -p.angle;
      ship.visible = options.reducedMotion || p.invincible === 0 || Math.floor(s.tick / 5) % 2 === 0;
      shield.visible = p.shieldActive;
      flame.visible = Math.hypot(p.vx, p.vy) > 1; flame.scale.y = options.reducedMotion ? .7 : .7 + Math.sin(s.tick) * .2;
      modules.forEach((group, index) => { group.visible = s.rig > index; });
      cargoPods.forEach((pod, index) => { pod.visible = s.cargo > index * 4; });
      rocks.forEach((object, index) => {
        const r = s.rocks[index]; object.group.visible = !!r; if (!r) return;
        const kind = r.composition ?? "ore";
        object.body.geometry = kind === "dense" ? denseGeometry : kind === "volatile" ? volatileGeometry : oreGeometry;
        object.body.material = kind === "dense" ? denseSurface : kind === "volatile" ? volatileSurface : oreSurface;
        object.veins.visible = kind === "ore"; object.band.visible = kind === "dense"; object.core.visible = kind === "volatile";
        object.group.position.set(r.x, .2, r.y); object.group.scale.setScalar(r.radius);
        object.group.rotation.set(options.reducedMotion ? r.id * .37 : r.spin, options.reducedMotion ? r.id * .19 : r.spin * .7, options.reducedMotion ? 0 : r.spin * .4);
      });
      shots.forEach((object, index) => {
        const b = s.shots[index]; object.visible = !!b;
        if (b) { object.position.set(b.x, .2, b.y); object.rotation.set(Math.PI / 2, 0, -Math.atan2(b.vx, b.vy)); }
      });
      ore.forEach((object, index) => {
        const b = s.ore[index]; object.visible = !!b;
        if (b) { object.position.set(b.x, .3, b.y); object.rotation.y = options.reducedMotion ? 0 : s.tick * .03; }
      });
      wreck.visible = !!s.wreck; tether.visible = !!s.wreck?.towed;
      if (s.wreck) {
        const item = s.wreck, seconds = Math.max(0, Math.ceil((item.expires - s.tick) / 60));
        wreck.position.set(item.x, 0, item.y); wreckRing.material = item.towed ? cyan : gold;
        // Only the ring moves: the objective label remains stable and legible.
        wreckRing.rotation.z = options.reducedMotion ? 0 : s.tick * .008;
        const signature = `${item.towed}:${seconds}`;
        if (signature !== towSignature) { towCue.paint(`${item.towed ? "TOW → REFINERY" : "HOLD SHIELD TO TOW"} · ${seconds}s`); towSignature = signature; }
        if (item.towed) {
          const dx = item.x - p.x, dz = item.y - p.y;
          tether.position.set((item.x + p.x) / 2, .25, (item.y + p.y) / 2);
          tether.scale.z = Math.hypot(dx, dz); tether.rotation.y = Math.atan2(dx, dz);
        }
      }
      const homeDistance = Math.hypot(p.x, p.y);
      refineryArrow.visible = (s.cargo > 0 || !!s.wreck?.towed) && homeDistance > 1.8;
      if (refineryArrow.visible) {
        refineryArrow.position.set(p.x - p.x / homeDistance * 1.25, .12, p.y - p.y / homeDistance * 1.25);
        refineryArrow.rotation.y = Math.atan2(-p.x, -p.y);
      }
      dockRing.material = (s.cargo > 0 || s.wreck?.towed) && homeDistance < 3 && Math.hypot(p.vx, p.vy) < 3.2 ? cyan : gold;
      if (previousSerial !== s.hitSerial) { hitUntil = s.tick + 15; previousSerial = s.hitSerial; }
      hit.visible = !options.reducedMotion && s.tick < hitUntil;
      hit.position.set(s.lastHit.x, .15, s.lastHit.y); hit.scale.setScalar(1 + (15 - (hitUntil - s.tick)) * .1);
      refinery.rotation.y = options.reducedMotion ? 0 : s.tick * .002;
      oreSurface.color.setHex(options.highContrast ? 0xbab5cf : 0x625d78);
      denseSurface.color.setHex(options.highContrast ? 0xd7edff : 0x647e95);
      volatileSurface.color.setHex(options.highContrast ? 0xffb0ae : 0x77454c);
      shieldMaterial.opacity = options.highContrast ? .4 : .2;
    },
    dispose() {
      if (disposed) return; disposed = true;
      stage.scene.remove(root); geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose()); root.clear();
    },
  };
}

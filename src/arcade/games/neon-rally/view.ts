import * as THREE from "three";
import type { ArcadeView, ThreeStage, VisualOptions } from "../../shared/contracts";
import { clamp, lerp } from "../../shared/math";
import { DISTRICT_NAMES, MAX_EFFECTS, MAX_ENTITIES, ROAD_HALF_WIDTH, isTraffic, type RallyEntity, type RallySimulation } from "./model";

const CITY_COUNT = 60;
const PARTICLE_COUNT = MAX_EFFECTS * 7;
const NIGHT = 0x070b1c;
const CYAN = 0x39f9ef;
const PINK = 0xff4fa1;

function cabinGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const corners = [
    [-0.68, 0, -0.78], [0.68, 0, -0.78], [0.68, 0, 0.8], [-0.68, 0, 0.8],
    [-0.53, 0.47, -0.43], [0.53, 0.47, -0.43], [0.53, 0.47, 0.5], [-0.53, 0.47, 0.5],
  ];
  const faces = [[0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0], [4, 7, 6, 5], [3, 0, 1, 2]];
  const vertices: number[] = [];
  for (const [a, b, c, d] of faces) for (const index of [a, b, c, a, c, d]) vertices.push(...corners[index]);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function bodyGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.63, 1.75);
  shape.lineTo(0.63, 1.75);
  shape.quadraticCurveTo(0.8, 1.75, 0.8, 1.5);
  shape.lineTo(0.8, -1.45);
  shape.quadraticCurveTo(0.8, -1.75, 0.59, -1.75);
  shape.lineTo(-0.59, -1.75);
  shape.quadraticCurveTo(-0.8, -1.75, -0.8, -1.45);
  shape.lineTo(-0.8, 1.5);
  shape.quadraticCurveTo(-0.8, 1.75, -0.63, 1.75);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.43, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.045, bevelSegments: 1, steps: 1, curveSegments: 3 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A view owns this group and its resources, never the shared renderer or simulation. */
export class RallyView implements ArcadeView {
  private readonly root = new THREE.Group();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly previousBackground: THREE.Color | THREE.Texture | THREE.CubeTexture | null;
  private readonly previousFog: THREE.Fog | THREE.FogExp2 | null;
  private readonly dummy = new THREE.Object3D();
  private readonly matrix = new THREE.Matrix4();
  private readonly local = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly whiteColor = new THREE.Color(0xffffff);
  private readonly nightColor = new THREE.Color(NIGHT);
  private readonly box: THREE.BoxGeometry;
  private readonly roadMaterial: THREE.MeshStandardMaterial;
  private readonly lineMaterial: THREE.MeshBasicMaterial;
  private readonly railMaterial: THREE.MeshBasicMaterial;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly glassMaterial: THREE.MeshStandardMaterial;
  private readonly roadTexture: THREE.CanvasTexture;
  private readonly body: THREE.InstancedMesh;
  private readonly cabins: THREE.InstancedMesh;
  private readonly roofs: THREE.InstancedMesh;
  private readonly wheels: THREE.InstancedMesh;
  private readonly headlights: THREE.InstancedMesh;
  private readonly taillights: THREE.InstancedMesh;
  private readonly skirts: THREE.InstancedMesh;
  private readonly cargo: THREE.InstancedMesh;
  private readonly cargoStripes: THREE.InstancedMesh;
  private readonly laneDashes: THREE.InstancedMesh;
  private readonly curbBlocks: THREE.InstancedMesh;
  private readonly city: THREE.InstancedMesh;
  private readonly windows: THREE.InstancedMesh;
  private readonly roofLights: THREE.InstancedMesh;
  private readonly poles: THREE.InstancedMesh;
  private readonly lampArms: THREE.InstancedMesh;
  private readonly lampHeads: THREE.InstancedMesh;
  private readonly lampPools: THREE.InstancedMesh;
  private readonly barriers: THREE.InstancedMesh;
  private readonly barrierFeet: THREE.InstancedMesh;
  private readonly barrierStripes: THREE.InstancedMesh;
  private readonly cones: THREE.InstancedMesh;
  private readonly coneBases: THREE.InstancedMesh;
  private readonly coneBands: THREE.InstancedMesh;
  private readonly oil: THREE.InstancedMesh;
  private readonly oilEdges: THREE.InstancedMesh;
  private readonly cells: THREE.InstancedMesh;
  private readonly cellCores: THREE.InstancedMesh;
  private readonly particles: THREE.InstancedMesh;
  private readonly streaks: THREE.InstancedMesh;
  private readonly playerRing: THREE.Mesh;
  private readonly headlightWash: THREE.Mesh;
  private readonly playerLight: THREE.PointLight;
  private readonly playerDetails: THREE.Group;
  private readonly sign: THREE.Group;
  private readonly signCanvas: HTMLCanvasElement;
  private readonly signTexture: THREE.CanvasTexture;
  private signDistrict = -1;
  private readonly bannerCanvas: HTMLCanvasElement;
  private readonly bannerTexture: THREE.CanvasTexture;
  private readonly banner: THREE.Sprite;
  private bannerKey = "";
  private lastContrast = false;
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(private readonly stage: ThreeStage, private readonly simulation: RallySimulation) {
    this.previousBackground = stage.scene.background;
    this.previousFog = stage.scene.fog;
    stage.scene.background = new THREE.Color(NIGHT);
    stage.scene.fog = new THREE.FogExp2(NIGHT, 0.008);
    this.root.name = "Neon Rally — original procedural city";
    stage.scene.add(this.root);
    const ambient = new THREE.HemisphereLight(0x97bbff, 0x201126, 2.3);
    const moon = new THREE.DirectionalLight(0xbdcaff, 2.1);
    moon.position.set(-12, 25, 8);
    this.root.add(ambient, moon);

    this.box = this.geometry(new THREE.BoxGeometry(1, 1, 1));
    this.roadTexture = this.asphaltTexture();
    this.roadMaterial = this.material(new THREE.MeshStandardMaterial({ color: 0x202537, roughness: 0.38, metalness: 0.4, map: this.roadTexture }));
    this.lineMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0x8099be }));
    this.railMaterial = this.material(new THREE.MeshBasicMaterial({ color: CYAN }));
    this.bodyMaterial = this.material(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.46, roughness: 0.32 }));
    this.glassMaterial = this.material(new THREE.MeshStandardMaterial({ color: 0x182d4a, metalness: 0.8, roughness: 0.16, emissive: 0x0a1e36, emissiveIntensity: 0.4 }));
    const charcoal = this.material(new THREE.MeshStandardMaterial({ color: 0x090e1d, roughness: 0.82 }));
    const roofPaint = this.material(new THREE.MeshStandardMaterial({ color: 0xa8bccf, metalness: 0.42, roughness: 0.35 }));
    const coldLight = this.material(new THREE.MeshBasicMaterial({ color: 0xc4ffff }));
    const redLight = this.material(new THREE.MeshBasicMaterial({ color: 0xff377f }));
    const cyanLight = this.material(new THREE.MeshBasicMaterial({ color: CYAN }));
    const cargoPaint = this.material(new THREE.MeshStandardMaterial({ color: 0x718098, metalness: 0.35, roughness: 0.55 }));
    this.mesh(this.box, this.material(new THREE.MeshStandardMaterial({ color: 0x101426, roughness: 0.6 })), 0, -0.6, -24, 150, 1, 160);
    this.mesh(this.box, this.roadMaterial, 0, -0.08, -25, ROAD_HALF_WIDTH * 2, 0.16, 110);
    // Raised shoulders, continuous neon rails and a narrow reflective drainage strip.
    for (const side of [-1, 1]) {
      this.mesh(this.box, charcoal, side * 8.15, 0.06, -25, 1.05, 0.16, 110);
      this.mesh(this.box, this.railMaterial, side * 7.65, 0.19, -25, 0.095, 0.09, 110);
      this.mesh(this.box, this.material(new THREE.MeshBasicMaterial({ color: PINK })), side * 8.65, 0.48, -25, 0.09, 0.07, 110);
      this.mesh(this.box, charcoal, side * 8.65, 0.22, -25, 0.12, 0.42, 110);
      this.mesh(this.box, this.material(new THREE.MeshBasicMaterial({ color: 0x31556c })), side * 7.9, 0.012, -25, 0.08, 0.01, 110);
    }
    // Sculpted roadside neon pylons give the expressway a stronger skyline silhouette.
    // All geometry stays outside the collision road; buffers/materials use the view registry.
    const pylonSurface = this.material(new THREE.MeshStandardMaterial({ color: 0x25344d, metalness: 0.68, roughness: 0.32 }));
    const pylonEdge = this.material(new THREE.MeshBasicMaterial({ color: 0xffb65e }));
    const pylonCap = this.geometry(new THREE.ConeGeometry(1, 1, 4));
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const z = -64 + i * 20, x = side * 10.8;
      this.mesh(this.box, pylonSurface, x, 1.4, z, 0.62, 2.8, 0.9);
      this.mesh(this.box, pylonEdge, x - side * 0.34, 1.4, z, 0.045, 2.15, 0.65);
      const cap = this.mesh(pylonCap, pylonSurface, x, 3.1, z, 1.15, 0.72, 1.15); cap.rotation.y = Math.PI / 4;
      this.mesh(this.box, pylonEdge, x, 2.77, z, 1.5, 0.055, 1.5);
    }
    this.laneDashes = this.instances(this.box, this.lineMaterial, 60);
    this.curbBlocks = this.instances(this.box, roofPaint, 48);

    const count = MAX_ENTITIES + 1;
    this.body = this.instances(this.geometry(bodyGeometry()), this.bodyMaterial, count);
    this.cabins = this.instances(this.geometry(cabinGeometry()), this.glassMaterial, count);
    this.roofs = this.instances(this.box, roofPaint, count);
    const wheelGeometry = this.geometry(new THREE.CylinderGeometry(0.3, 0.3, 0.19, 10));
    wheelGeometry.rotateZ(Math.PI / 2);
    this.wheels = this.instances(wheelGeometry, charcoal, count * 4);
    this.headlights = this.instances(this.box, coldLight, count * 2);
    this.taillights = this.instances(this.box, redLight, count * 2);
    this.skirts = this.instances(this.box, cyanLight, count * 2);
    this.cargo = this.instances(this.box, cargoPaint, count);
    this.cargoStripes = this.instances(this.box, cyanLight, count * 3);

    const buildingMaterial = this.material(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.64, metalness: 0.22 }));
    this.city = this.instances(this.box, buildingMaterial, CITY_COUNT);
    this.windows = this.instances(this.box, this.material(new THREE.MeshBasicMaterial({ color: 0xffffff })), CITY_COUNT * 16);
    this.roofLights = this.instances(this.box, this.material(new THREE.MeshBasicMaterial({ color: 0xffffff })), CITY_COUNT * 2);
    this.poles = this.instances(this.box, cargoPaint, 20);
    this.lampArms = this.instances(this.box, cargoPaint, 20);
    this.lampHeads = this.instances(this.box, coldLight, 20);
    this.lampPools = this.instances(this.geometry(new THREE.PlaneGeometry(1, 1)), this.material(new THREE.MeshBasicMaterial({ map: this.glowTexture(), color: 0x54a5c2, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide })), 20);

    const warning = this.material(new THREE.MeshStandardMaterial({ color: 0xff8b3d, emissive: 0x8a2708, emissiveIntensity: 0.3, roughness: 0.6 }));
    const white = this.material(new THREE.MeshBasicMaterial({ color: 0xffe4af }));
    this.barriers = this.instances(this.box, warning, MAX_ENTITIES);
    this.barrierFeet = this.instances(this.box, charcoal, MAX_ENTITIES * 2);
    this.barrierStripes = this.instances(this.box, white, MAX_ENTITIES * 4);
    this.cones = this.instances(this.geometry(new THREE.ConeGeometry(0.3, 0.9, 7)), warning, MAX_ENTITIES);
    this.coneBases = this.instances(this.box, charcoal, MAX_ENTITIES);
    this.coneBands = this.instances(this.geometry(new THREE.CylinderGeometry(0.13, 0.18, 0.15, 7)), white, MAX_ENTITIES);
    this.oil = this.instances(this.geometry(new THREE.CircleGeometry(1, 24)), this.material(new THREE.MeshStandardMaterial({ color: 0x160e24, metalness: 0.95, roughness: 0.05, side: THREE.DoubleSide })), MAX_ENTITIES);
    this.oilEdges = this.instances(this.geometry(new THREE.RingGeometry(0.87, 1, 24)), this.material(new THREE.MeshBasicMaterial({ color: 0xa76ce8, transparent: true, opacity: 0.82, side: THREE.DoubleSide })), MAX_ENTITIES);
    this.cells = this.instances(this.geometry(new THREE.OctahedronGeometry(0.58)), this.material(new THREE.MeshStandardMaterial({ color: 0x61ffe0, emissive: 0x22e8a2, emissiveIntensity: 1.1, wireframe: true })), MAX_ENTITIES);
    this.cellCores = this.instances(this.box, this.material(new THREE.MeshBasicMaterial({ color: 0xcbfff1 })), MAX_ENTITIES * 2);
    this.particles = this.instances(this.geometry(new THREE.IcosahedronGeometry(0.1, 0)), this.material(new THREE.MeshBasicMaterial({ color: 0xffffff })), PARTICLE_COUNT);
    this.streaks = this.instances(this.box, cyanLight, 20);

    this.playerRing = this.mesh(this.geometry(new THREE.RingGeometry(1.05, 1.12, 32)), this.material(new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })), 0, 0.025, 0, 1, 1.75, 1);
    this.playerRing.rotation.x = -Math.PI / 2;
    const beamShape = new THREE.Shape();
    beamShape.moveTo(-0.5, 0);
    beamShape.lineTo(0.5, 0);
    beamShape.lineTo(2.1, 8);
    beamShape.lineTo(-2.1, 8);
    beamShape.closePath();
    this.headlightWash = this.mesh(this.geometry(new THREE.ShapeGeometry(beamShape)), this.material(new THREE.MeshBasicMaterial({ color: 0xb2f9ff, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false })), 0, 0.018, -1.4, 1, 1, 1);
    this.headlightWash.rotation.x = -Math.PI / 2;
    this.playerLight = new THREE.PointLight(CYAN, 5, 7, 2);
    this.playerLight.position.set(0, 1.5, 0);
    this.root.add(this.playerLight);
    this.playerDetails = new THREE.Group();
    this.root.add(this.playerDetails);
    this.mesh(this.box, redLight, -0.15, 0.77, -1.0, 0.12, 0.025, 0.75, this.playerDetails);
    this.mesh(this.box, cyanLight, 0.15, 0.77, -1.0, 0.12, 0.025, 0.75, this.playerDetails);
    this.mesh(this.box, charcoal, 0, 0.95, 1.42, 1.52, 0.09, 0.24, this.playerDetails);
    for (const side of [-1, 1]) this.mesh(this.box, charcoal, side * 0.5, 0.84, 1.42, 0.065, 0.22, 0.12, this.playerDetails);

    this.signCanvas = document.createElement("canvas");
    this.signCanvas.width = 768;
    this.signCanvas.height = 192;
    this.signTexture = this.texture(new THREE.CanvasTexture(this.signCanvas));
    this.sign = new THREE.Group();
    this.root.add(this.sign);
    for (const side of [-1, 1]) this.mesh(this.box, cargoPaint, side * 8.05, 3.7, 0, 0.2, 7.4, 0.2, this.sign);
    this.mesh(this.box, cargoPaint, 0, 7.25, 0, 16.3, 0.2, 0.2, this.sign);
    const signMesh = this.mesh(this.geometry(new THREE.PlaneGeometry(10.2, 2.55)), this.material(new THREE.MeshBasicMaterial({ map: this.signTexture, side: THREE.DoubleSide })), 0, 6.1, 0.1, 1, 1, 1, this.sign);
    signMesh.rotation.x = -0.5;
    this.bannerCanvas = document.createElement("canvas");
    this.bannerCanvas.width = 640;
    this.bannerCanvas.height = 112;
    this.bannerTexture = this.texture(new THREE.CanvasTexture(this.bannerCanvas));
    this.banner = new THREE.Sprite(this.material(new THREE.SpriteMaterial({ map: this.bannerTexture, transparent: true, depthTest: false, depthWrite: false })));
    this.banner.scale.set(8.5, 1.49, 1);
    this.banner.renderOrder = 10;
    this.root.add(this.banner);

    this.resize(stage.width, stage.height);
    this.update(1, { reducedMotion: false, highContrast: false });
  }

  update(alpha: number, options: VisualOptions): void {
    if (this.disposed) return;
    const state = this.simulation.state;
    const fraction = clamp(alpha, 0, 1);
    const distance = lerp(state.previousDistance, state.distance, fraction);
    const playerX = lerp(state.player.previousX, state.player.x, fraction);
    if (this.lastContrast !== options.highContrast) {
      this.lastContrast = options.highContrast;
      this.roadMaterial.color.setHex(options.highContrast ? 0x181d2a : 0x202537);
      this.lineMaterial.color.setHex(options.highContrast ? 0xe6f4ff : 0x8099be);
      this.railMaterial.color.setHex(options.highContrast ? 0x6ffff3 : CYAN);
      this.glassMaterial.color.setHex(options.highContrast ? 0x0b1525 : 0x182d4a);
      this.stage.scene.fog = options.highContrast ? null : new THREE.FogExp2(NIGHT, 0.008);
    }
    this.roadTexture.offset.y = -(distance % 64) / 64;
    let dashIndex = 0;
    for (const x of [-3.6, 0, 3.6]) for (let index = 0; index < 20; index++) {
      this.place(this.laneDashes, dashIndex++, x, 0.018, -(index * 5.3 - distance % 5.3 - 14), 0.09, 0.025, 2.5);
    }
    this.finish(this.laneDashes, dashIndex);
    let curb = 0;
    for (const side of [-1, 1]) for (let index = 0; index < 24; index++) {
      this.place(this.curbBlocks, curb++, side * 8.15, 0.17, -(index * 4.8 - distance % 4.8 - 15), 0.65, 0.05, 1.7);
    }
    this.finish(this.curbBlocks, curb);
    this.updateCity(distance, options);

    let cars = 0;
    let cargo = 0;
    const blink = state.status === "playing" && state.player.invulnerable > 0 && Math.floor(state.tick / 5) % 2 === 0;
    if (!blink || options.reducedMotion) this.drawCar(cars++, playerX, 0, -state.player.heading, 1.56, 3.2, 0xf3f5ff, "player", cargo++);
    for (const entity of state.entities) {
      if (!isTraffic(entity.kind)) continue;
      const x = lerp(entity.previousX, entity.x, fraction);
      const depth = lerp(entity.previousDistance, entity.distance, fraction);
      const lean = clamp((entity.x - entity.previousX) * 7, -0.13, 0.13);
      this.drawCar(cars++, x, -depth, -lean, entity.width, entity.length,
        entity.hit ? 0x67627b : this.color.setHex(entity.color).lerp(this.whiteColor, options.highContrast ? 0.24 : 0.065).getHex(),
        entity.kind, cargo++);
    }
    this.finish(this.body, cars);
    this.finish(this.cabins, cars);
    this.finish(this.roofs, cars);
    this.finish(this.wheels, cars * 4);
    this.finish(this.headlights, cars * 2);
    this.finish(this.taillights, cars * 2);
    this.finish(this.skirts, cars * 2);
    this.finish(this.cargo, cargo);
    this.finish(this.cargoStripes, cargo * 3);
    this.body.instanceColor!.needsUpdate = true;

    this.updateHazards(fraction, options);
    this.updateEffects(options);
    this.playerRing.position.x = playerX;
    this.playerRing.material instanceof THREE.MeshBasicMaterial && this.playerRing.material.color.setHex(state.player.boosting ? PINK : state.player.oilTicks > 0 ? 0xffbe67 : CYAN);
    this.headlightWash.position.x = playerX;
    this.headlightWash.rotation.z = -state.player.heading;
    this.playerLight.position.x = playerX;
    this.playerLight.intensity = state.player.boosting ? 10 : 5;
    this.playerDetails.position.x = playerX;
    this.playerDetails.rotation.y = -state.player.heading;
    this.playerDetails.visible = !blink || options.reducedMotion;

    this.sign.position.z = -(118 - distance % 180);
    if (state.district !== this.signDistrict) {
      this.signDistrict = state.district;
      this.paintSign();
    }
    const callout = state.callout;
    this.banner.visible = !!callout;
    if (callout) {
      const key = `${callout.label}:${callout.value}`;
      if (key !== this.bannerKey) {
        this.bannerKey = key;
        this.paintBanner(callout.label, callout.value);
      }
      this.banner.position.set(playerX * 0.22, 1.1, 5.8);
      (this.banner.material as THREE.SpriteMaterial).opacity = options.reducedMotion ? 1 : Math.min(1, callout.ticks / 15);
    }
    const boosted = state.player.boosting && !options.reducedMotion;
    this.streaks.visible = boosted;
    if (boosted) {
      for (let index = 0; index < 20; index++) {
        const side = index % 2 === 0 ? -1 : 1;
        this.place(this.streaks, index, side * (8.8 + index % 4 * 0.42), 0.28, -((index * 9.1 - distance * 1.4) % 85 + 85) % 85 + 12, 0.035, 0.035, 2.3 + index % 3);
      }
      this.finish(this.streaks, 20);
    }
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const aspect = this.width / this.height;
    const halfHeight = Math.max(25.5, 11.4 / aspect);
    const halfWidth = halfHeight * aspect;
    const camera = this.stage.camera;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.near = 0.1;
    camera.far = 230;
    camera.position.set(0, 58, 44);
    camera.lookAt(0, 0, -17);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.traverse((object) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.stage.scene.remove(this.root);
    this.stage.scene.background = this.previousBackground;
    this.stage.scene.fog = this.previousFog;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }

  private drawCar(index: number, x: number, z: number, yaw: number, width: number, length: number, color: number, kind: RallyEntity["kind"] | "player", cargoIndex: number): void {
    const truck = kind === "truck";
    const van = kind === "van";
    const bike = kind === "bike";
    const sx = width / 1.6;
    const sz = length / 3.5;
    this.dummy.position.set(x, 0, z);
    this.dummy.rotation.set(0, yaw, 0);
    this.dummy.scale.set(1, 1, 1);
    this.dummy.updateMatrix();
    const root = this.dummy.matrix;
    this.part(this.body, index, root, 0, 0.3, 0, sx, bike ? 0.75 : 1, sz);
    this.body.setColorAt(index, this.color.setHex(color));
    const cabinZ = truck ? -length * 0.32 : 0.18;
    this.part(this.cabins, index, root, 0, bike ? 0.62 : truck ? 0.94 : 0.75, cabinZ, sx * (bike ? 0.55 : 1), van ? 1.7 : truck ? 1.2 : 1, truck ? 0.85 : bike ? 0.7 : 1);
    this.part(this.roofs, index, root, 0, bike ? 1.05 : van ? 1.55 : truck ? 1.55 : 1.22, cabinZ + 0.04, sx * (bike ? 0.35 : 1.1), 0.055, truck ? 0.85 : 0.87);
    for (let wheel = 0; wheel < 4; wheel++) {
      const side = wheel % 2 === 0 ? -1 : 1;
      const end = wheel < 2 ? -1 : 1;
      this.part(this.wheels, index * 4 + wheel, root, side * width * (bike ? 0.2 : 0.49), 0.3, end * length * 0.3, bike ? 0.8 : 1, truck ? 1.15 : 1, truck ? 1.15 : 1);
    }
    for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
      const side = sideIndex === 0 ? -1 : 1;
      this.part(this.headlights, index * 2 + sideIndex, root, side * width * 0.31, 0.53, -length * 0.5 - 0.01, width * 0.23, 0.1, 0.07);
      this.part(this.taillights, index * 2 + sideIndex, root, side * width * 0.31, 0.53, length * 0.5 + 0.01, width * 0.23, 0.1, 0.065);
      this.part(this.skirts, index * 2 + sideIndex, root, side * width * 0.5, 0.24, 0, 0.035, 0.035, length * 0.75);
    }
    // Zero-scale cargo slots keep a fixed, allocation-free part index for every car.
    this.part(this.cargo, cargoIndex, root, 0, 1.35, truck ? 0.65 : 0.25, truck ? width * 0.96 : van ? width * 0.94 : 0, truck ? 1.85 : van ? 1.45 : 0, truck ? length * 0.62 : van ? length * 0.58 : 0);
    for (let stripe = 0; stripe < 3; stripe++) this.part(this.cargoStripes, cargoIndex * 3 + stripe, root, (stripe - 1) * width * 0.3, truck ? 2.29 : 1.99, truck ? 0.65 : 0.25, truck || van ? 0.035 : 0, 0.025, truck ? length * 0.54 : van ? length * 0.45 : 0);
  }

  private updateCity(distance: number, options: VisualOptions): void {
    let window = 0;
    let roof = 0;
    for (let index = 0; index < CITY_COUNT; index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 6);
      const column = Math.floor(index / 2) % 3;
      const hash = ((index + 17) * 7919) % 997;
      const width = 3.4 + hash % 22 / 10;
      const depth = 4 + hash % 30 / 10;
      const height = 3.8 + hash % 125 / 10;
      const x = side * (12.3 + column * 7 + hash % 9 / 10);
      const d = ((row * 13.8 + column * 3.2 - distance) % 138 + 138) % 138 - 22;
      const z = -d;
      this.place(this.city, index, x, height / 2 - 0.1, z, width, height, depth);
      this.city.setColorAt(index, this.color.setHex(index % 3 === 0 ? 0x28324f : index % 3 === 1 ? 0x252039 : 0x172d40));
      const tint = index % 4 === 0 ? 0xff66ab : index % 4 === 1 ? 0x8c90ff : index % 4 === 2 ? 0x50e7de : 0xe7bc85;
      for (let level = 0; level < 4; level++) for (let pane = 0; pane < 2; pane++) {
        this.place(this.windows, window, x - side * (width / 2 + 0.012), 1 + (height - 1.8) * level / 4, z + (pane === 0 ? -1 : 1) * depth * 0.23, 0.025, options.highContrast ? 0.2 : 0.14, depth * (index % 3 === 0 ? 0.27 : 0.16));
        this.windows.setColorAt(window++, this.color.setHex(tint).multiplyScalar(options.highContrast ? 1 : 0.64));
        // Camera-facing windows make the towers read as tall volumes, even at x=0.
        this.place(this.windows, window, x + (pane === 0 ? -1 : 1) * width * 0.23, 1 + (height - 1.8) * level / 4, z + depth / 2 + 0.015, width * (index % 4 === 0 ? 0.33 : 0.22), options.highContrast ? 0.22 : 0.16, 0.025);
        this.windows.setColorAt(window++, this.color.setHex(tint));
      }
      this.place(this.roofLights, roof, x - side * width / 2, height + 0.01, z, 0.055, 0.055, depth);
      this.roofLights.setColorAt(roof++, this.color.setHex(tint));
      this.place(this.roofLights, roof, x, height + 0.01, z + depth / 2, width, 0.055, 0.055);
      this.roofLights.setColorAt(roof++, this.color.setHex(tint));
    }
    this.finish(this.city, CITY_COUNT);
    this.finish(this.windows, window);
    this.finish(this.roofLights, roof);
    this.city.instanceColor!.needsUpdate = true;
    this.windows.instanceColor!.needsUpdate = true;
    this.roofLights.instanceColor!.needsUpdate = true;
    for (let index = 0; index < 20; index++) {
      const side = index % 2 === 0 ? -1 : 1;
      const z = -(((Math.floor(index / 2) * 13 - distance) % 130 + 130) % 130 - 17);
      this.place(this.poles, index, side * 9.15, 2.65, z, 0.08, 5.3, 0.08);
      this.place(this.lampArms, index, side * 8.62, 5.25, z, 1.15, 0.06, 0.06);
      this.place(this.lampHeads, index, side * 8.05, 5.2, z, 0.48, 0.065, 0.25);
      this.place(this.lampPools, index, side * 6.3, 0.015, z - 0.5, 4.4, 8.8, 1, -Math.PI / 2);
    }
    for (const mesh of [this.poles, this.lampArms, this.lampHeads, this.lampPools]) this.finish(mesh, 20);
  }

  private updateHazards(alpha: number, options: VisualOptions): void {
    let barrier = 0;
    let cone = 0;
    let oil = 0;
    let cell = 0;
    const tick = this.simulation.state.tick;
    for (const entity of this.simulation.state.entities) {
      if (isTraffic(entity.kind)) continue;
      const x = lerp(entity.previousX, entity.x, alpha);
      const z = -lerp(entity.previousDistance, entity.distance, alpha);
      if (entity.kind === "barrier") {
        this.place(this.barriers, barrier, x, 0.63, z, 2.5, 0.8, 0.45);
        for (let side = 0; side < 2; side++) this.place(this.barrierFeet, barrier * 2 + side, x + (side === 0 ? -0.9 : 0.9), 0.17, z, 0.25, 0.35, 1.05);
        for (let stripe = 0; stripe < 4; stripe++) {
          this.place(this.barrierStripes, barrier * 4 + stripe, x - 0.9 + stripe * 0.6, 0.64, z + 0.232, 0.2, 0.82, 0.015, 0, 0, -0.36);
        }
        barrier++;
      } else if (entity.kind === "cone") {
        this.place(this.cones, cone, x, 0.52, z, 1, 1, 1);
        this.place(this.coneBases, cone, x, 0.07, z, 0.7, 0.13, 0.7);
        this.place(this.coneBands, cone, x, 0.56, z, 1, 1, 1);
        cone++;
      } else if (entity.kind === "oil") {
        this.place(this.oil, oil, x, 0.018, z, entity.width / 2, entity.length / 2, 1, -Math.PI / 2);
        this.place(this.oilEdges, oil, x, 0.021, z, entity.width / 2, entity.length / 2, 1, -Math.PI / 2);
        oil++;
      } else if (entity.kind === "cell" && !entity.hit) {
        this.place(this.cells, cell, x, 0.9 + (options.reducedMotion ? 0 : Math.sin(tick * 0.05) * 0.14), z, 1, 1, 1, 0, options.reducedMotion ? 0.5 : tick * 0.025);
        this.place(this.cellCores, cell * 2, x, 0.9, z, 0.52, 0.14, 0.18);
        this.place(this.cellCores, cell * 2 + 1, x, 0.9, z, 0.14, 0.52, 0.18);
        cell++;
      }
    }
    this.finish(this.barriers, barrier);
    this.finish(this.barrierFeet, barrier * 2);
    this.finish(this.barrierStripes, barrier * 4);
    this.finish(this.cones, cone);
    this.finish(this.coneBases, cone);
    this.finish(this.coneBands, cone);
    this.finish(this.oil, oil);
    this.finish(this.oilEdges, oil);
    this.finish(this.cells, cell);
    this.finish(this.cellCores, cell * 2);
  }

  private updateEffects(options: VisualOptions): void {
    let count = 0;
    for (const effect of this.simulation.state.effects) {
      const age = 1 - effect.life / effect.duration;
      const smoke = effect.kind === "drift";
      const color = smoke ? 0x8b77ae : effect.kind === "spark" ? 0xffc578 : effect.kind === "repair" ? 0x75ffe3 : effect.kind === "boost" ? 0x63d9ff : 0xff6daf;
      const number = options.reducedMotion ? 2 : 7;
      for (let part = 0; part < number && count < PARTICLE_COUNT; part++) {
        const angle = effect.id * 2.399 + part * 2.4;
        const spread = (smoke ? 0.6 : 1.7) * age;
        const size = smoke ? 1.1 + age * 2.8 : Math.max(0.05, 1.3 - age);
        const x = effect.x + Math.cos(angle) * spread;
        const z = -effect.distance + Math.sin(angle) * spread;
        const height = smoke ? 0.3 + age * 0.6 : 0.35 + Math.sin(age * Math.PI) * (0.3 + part * 0.12);
        this.place(this.particles, count, x, height, z, size, smoke ? size * 0.5 : size, size);
        this.particles.setColorAt(count++, this.color.setHex(color).lerp(this.nightColor, age * 0.75));
      }
    }
    this.finish(this.particles, count);
    if (count) this.particles.instanceColor!.needsUpdate = true;
  }

  private paintSign(): void {
    const context = this.signCanvas.getContext("2d")!;
    context.fillStyle = "#101d31";
    context.fillRect(0, 0, 768, 192);
    context.strokeStyle = "#45f3de";
    context.lineWidth = 5;
    context.strokeRect(7, 7, 754, 178);
    context.fillStyle = "#44f6de";
    context.font = "600 22px monospace";
    context.fillText("NIGHT EXPRESSWAY   /   0" + (this.signDistrict + 1), 34, 44);
    context.fillStyle = "#edfaff";
    context.font = "800 53px sans-serif";
    context.fillText(DISTRICT_NAMES[this.signDistrict], 32, 108);
    context.fillStyle = "#a7b9d0";
    context.font = "500 21px monospace";
    context.fillText("KEEP MOVING   ↓       ↓       ↓       ↓", 35, 156);
    this.signTexture.needsUpdate = true;
  }

  private paintBanner(label: string, value: number): void {
    const context = this.bannerCanvas.getContext("2d")!;
    context.clearRect(0, 0, 640, 112);
    context.fillStyle = "rgba(6, 12, 29, 0.9)";
    context.beginPath();
    context.roundRect(4, 4, 632, 104, 10);
    context.fill();
    context.strokeStyle = label === "OIL SLICK" || label === "CAR LOST" ? "#ffb96d" : "#4ff8de";
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = "#f1ffff";
    context.textAlign = "center";
    context.font = "800 34px sans-serif";
    context.fillText(label + (value > 0 && label !== "CAR LOST" ? `  +${value}` : ""), 320, 52);
    context.fillStyle = "#8ba8c9";
    context.font = "500 18px monospace";
    const subtitle = label === "NEAR MISS" || label === "DANGEROUS" ? "CLOSE PASS · NITRO REFILLED" : label === "DRIFT BANKED" ? "CONTROL THE SLIDE · BUILD THE CHAIN" : label === "CHECKPOINT" ? "ARMOR +18 · NITRO +22" : label === "REPAIRED" ? "ARMOR +22 · NITRO +35" : label === "CAR LOST" ? `${value} ${value === 1 ? "CAR" : "CARS"} REMAINING · KEEP GOING` : label === "NITRO" ? "MORE SPEED · MORE RISK" : label === "OIL SLICK" ? "EASE THE STEERING" : "THE CITY IS YOURS";
    context.fillText(subtitle, 320, 85);
    this.bannerTexture.needsUpdate = true;
  }

  private asphaltTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#a8b4c7";
    context.fillRect(0, 0, 128, 256);
    for (let index = 0; index < 900; index++) {
      const x = (index * 73 + 19) % 128;
      const y = (index * 137 + 51) % 256;
      context.fillStyle = index % 3 === 0 ? "#8190a9" : "#c1cad7";
      context.fillRect(x, y, 1, index % 5 === 0 ? 3 : 1);
    }
    const texture = this.texture(new THREE.CanvasTexture(canvas));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 9);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private glowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,0.75)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.28)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return this.texture(new THREE.CanvasTexture(canvas));
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  private material<T extends THREE.Material>(material: T): T {
    // Neon tubes and signs retain their designed color under the shared ACES stage.
    if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.SpriteMaterial) {
      material.toneMapped = false;
      material.fog = false;
    }
    this.materials.add(material);
    return material;
  }
  private texture<T extends THREE.Texture>(texture: T): T { this.textures.add(texture); texture.colorSpace = THREE.SRGBColorSpace; return texture; }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: THREE.Group = this.root): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }

  private instances(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Bounds cover an entire streamed city rather than stale initial matrices.
    mesh.frustumCulled = false;
    this.root.add(mesh);
    return mesh;
  }

  private place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): void {
    this.local.position.set(x, y, z);
    this.local.rotation.set(rx, ry, rz);
    this.local.scale.set(sx, sy, sz);
    this.local.updateMatrix();
    mesh.setMatrixAt(index, this.local.matrix);
  }

  private part(mesh: THREE.InstancedMesh, index: number, parent: THREE.Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    this.local.position.set(x, y, z);
    this.local.rotation.set(0, 0, 0);
    this.local.scale.set(sx, sy, sz);
    this.local.updateMatrix();
    this.matrix.multiplyMatrices(parent, this.local.matrix);
    mesh.setMatrixAt(index, this.matrix);
  }

  private finish(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

export function createView(stage: ThreeStage, simulation: RallySimulation): RallyView {
  return new RallyView(stage, simulation);
}

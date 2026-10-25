import * as THREE from "three";
import { cabinets } from "./catalog";
import { Stage } from "./scene";

/** One inexpensive 3D scene for the five cabinets; never five game contexts. */
export class Showroom {
  private stage: Stage | null = null;
  private frame = 0;
  private disposed = false;
  private readonly cabinetBounds = new THREE.Box3();
  constructor(private mount: HTMLElement, private reducedMotion: boolean) {
    try {
      this.stage = new Stage(mount, () => this.dispose(), () => {});
      const { scene, camera } = this.stage;
      scene.background = new THREE.Color(0x080b12);
      camera.position.set(12, 10, 18); camera.lookAt(0, 1.4, 0);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), new THREE.MeshStandardMaterial({ color: 0x0b101b, metalness: 0.55, roughness: 0.38 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.03; scene.add(floor);
      const grid = new THREE.GridHelper(26, 26, 0x27364e, 0x101c2d); grid.position.y = 0.005; scene.add(grid);
      const box = new THREE.BoxGeometry(1, 1, 1);
      const add = (group: THREE.Group, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material) => {
        const mesh = new THREE.Mesh(box, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); group.add(mesh); return mesh;
      };
      cabinets.forEach((cabinet, index) => {
        const group = new THREE.Group(); group.position.set((index - 2) * 2.42, 0, Math.abs(index - 2) * 0.18);
        group.rotation.y = (index - 2) * -0.055;
        const dark = new THREE.MeshStandardMaterial({ color: 0x111828, roughness: 0.55, metalness: 0.45 });
        const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(cabinet.accent).multiplyScalar(0.34), roughness: 0.5, metalness: 0.5 });
        const trim = new THREE.MeshStandardMaterial({ color: cabinet.accent, emissive: cabinet.accent, emissiveIntensity: 0.6, roughness: 0.4 });
        add(group, 0, 1.7, 0, 1.96, 3.4, 1.55, dark);
        add(group, -1, 1.75, 0, 0.12, 3.5, 1.7, side); add(group, 1, 1.75, 0, 0.12, 3.5, 1.7, side);
        add(group, 0, 3.48, 0.1, 2.13, 0.24, 1.92, trim);
        add(group, 0, 2.45, 0.81, 1.6, 1.46, 0.08, trim);
        const screen = add(group, 0, 2.45, 0.87, 1.47, 1.32, 0.04, new THREE.MeshBasicMaterial({ map: this.screen(cabinet.title, cabinet.accent, index), toneMapped: false }));
        screen.rotation.x = -0.03;
        const deck = add(group, 0, 1.51, 1.03, 2.0, 0.18, 0.86, side); deck.rotation.x = -0.12;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.19, 6), dark); stem.position.set(-0.4, 1.75, 1.0); group.add(stem);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), trim); ball.position.set(-0.4, 1.87, 1.0); group.add(ball);
        for (let button = 0; button < 3; button++) {
          const key = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 10), trim); key.position.set(0.15 + button * 0.21, 1.66, 1.15); group.add(key);
        }
        add(group, 0, 0.68, 0.8, 0.32, 0.16, 0.04, new THREE.MeshStandardMaterial({ color: 0x04060b }));
        add(group, 0, 0.08, 0.1, 1.98, 0.1, 1.92, trim);
        scene.add(group);
        this.cabinetBounds.expandByObject(group);
      });
      this.resize(); this.draw();
    } catch { mount.classList.add("showroom-fallback"); mount.setAttribute("aria-label", "Five arcade cabinets, open for one more round."); }
  }
  private screen(title: string, accent: string, index: number): THREE.CanvasTexture {
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#050811"; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = `${accent}70`; ctx.lineWidth = 2;
    for (let line = 24; line < 250; line += 24) { ctx.beginPath(); ctx.moveTo(0, line); ctx.lineTo(256, line); ctx.stroke(); }
    ctx.fillStyle = accent; ctx.font = "bold 21px monospace"; ctx.textAlign = "center";
    title.split(" ").forEach((part, row, words) => ctx.fillText(part, 128, 48 + row * 25 - (words.length - 1) * 5));
    ctx.font = "bold 88px monospace"; ctx.fillText(cabinets[index].glyph, 128, 176);
    ctx.font = "12px monospace"; ctx.fillText("PRESS PLAY", 128, 225);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  resize(): void {
    if (!this.stage) return; this.stage.resize();
    const aspect = this.stage.width / this.stage.height, camera = this.stage.camera;
    camera.updateMatrixWorld(true);
    let halfWidth = 1, halfHeight = 1;
    const min = this.cabinetBounds.min, max = this.cabinetBounds.max;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      halfWidth = Math.max(halfWidth, Math.abs(point.x)); halfHeight = Math.max(halfHeight, Math.abs(point.y));
    }
    halfHeight = Math.max(halfHeight * 1.12, halfWidth * 1.1 / aspect);
    halfWidth = halfHeight * aspect;
    camera.left = -halfWidth; camera.right = halfWidth;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    this.stage.camera.updateProjectionMatrix(); this.stage.draw();
  }
  private draw = () => {
    if (this.disposed || !this.stage) return;
    this.stage.draw();
    // Cabinet art is a static real-geometry scene. Redraw only for resize;
    // no idle WebGL animation loop competes with gameplay on mobile.
  };
  dispose(): void { this.disposed = true; cancelAnimationFrame(this.frame); this.stage?.dispose(); this.stage = null; }
}

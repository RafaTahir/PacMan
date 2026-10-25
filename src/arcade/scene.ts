import * as THREE from "three";
import type { ThreeStage } from "./shared/contracts";
export class Stage implements ThreeStage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-12, 12, 10, -10, 0.1, 180);
  readonly renderer: THREE.WebGLRenderer;
  width = 1;
  height = 1;
  private resourcesDisposed = false;
  constructor(public readonly mount: HTMLElement, onLost: () => void, onRestored: () => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x060911);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.id = "arcade-canvas";
    this.renderer.domElement.setAttribute("aria-label", "3D arcade playfield; controls and instructions below.");
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.addEventListener("webglcontextlost", event => { event.preventDefault(); onLost(); });
    this.renderer.domElement.addEventListener("webglcontextrestored", onRestored);
    this.scene.add(new THREE.AmbientLight(0xb6caff, 1.1));
    const key = new THREE.DirectionalLight(0xe3eaff, 2.8); key.position.set(-10, 24, 12); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x6cdcff, 1); fill.position.set(12, 8, -15); this.scene.add(fill);
    this.camera.position.set(0, 26, 17); this.camera.lookAt(0, 0, 0);
    mount.append(this.renderer.domElement);
    this.resize();
  }
  resize(): void {
    const rect = this.mount.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    const budget = Math.sqrt(1_200_000 / (this.width * this.height));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5, budget));
    this.renderer.setSize(this.width, this.height, false);
  }
  draw(): void { if (!this.resourcesDisposed) this.renderer.render(this.scene, this.camera); }
  dispose(): void {
    if (this.resourcesDisposed) return;
    this.resourcesDisposed = true;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    textures.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); geometries.forEach(value => value.dispose());
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove(); this.scene.clear();
  }
}

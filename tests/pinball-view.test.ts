import { afterEach, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createSimulation } from "../src/arcade/games/midnight-pinball/model";
import { createView } from "../src/arcade/games/midnight-pinball/view";

afterEach(() => vi.unstubAllGlobals());

it("aligns the physical sweet-spot marker with 55–75% charge after static batching", () => {
  // Geometry does not need a canvas rasterizer; optional decorative labels skip.
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  const simulation = createSimulation(3), scene = new THREE.Scene(), camera = new THREE.OrthographicCamera();
  const view = createView({ scene, camera, width: 960, height: 600, renderer: {} as THREE.WebGLRenderer }, simulation.state);
  const gauge = scene.getObjectByName("plunger-charge")!, marker = scene.getObjectByName("plunger-sweet-spot")!;
  expect(gauge).toBeDefined(); expect(marker).toBeDefined();
  for (const [charge, edge] of [[.55, "min"], [.75, "max"]] as const) {
    simulation.state.plungerCharge = charge;
    view.update(0, { highContrast: true, reducedMotion: true });
    scene.updateMatrixWorld(true);
    const fill = new THREE.Box3().setFromObject(gauge), sweetSpot = new THREE.Box3().setFromObject(marker);
    expect(fill.max.y).toBeCloseTo(sweetSpot[edge].y);
    expect(gauge.visible && marker.visible).toBe(true);
  }
  simulation.state.balls[0].mode = "table";
  view.update(0, { highContrast: true, reducedMotion: true });
  expect(gauge.visible || marker.visible).toBe(false);
  view.dispose(); expect(scene.children).toHaveLength(0);
});

import { describe, expect, it } from "vitest";
import {
  ghostGeometry,
  pacmanGeometry,
  sphereGeometry,
  type Geometry,
} from "../src/mesh-geometry";

type Vector = [number, number, number];

function vertex(values: Float32Array, index: number): Vector {
  return [values[index * 3], values[index * 3 + 1], values[index * 3 + 2]];
}

function points(mesh: Geometry): Vector[] {
  return Array.from({ length: mesh.positions.length / 3 }, (_, index) => vertex(mesh.positions, index));
}

function subtract(a: Vector, b: Vector): Vector {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vector, b: Vector): Vector {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vector, b: Vector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function triangles(mesh: Geometry): number[][] {
  return Array.from({ length: mesh.indices.length / 3 }, (_, index) =>
    Array.from(mesh.indices.slice(index * 3, index * 3 + 3)),
  );
}

function signedVolume(mesh: Geometry): number {
  return triangles(mesh).reduce((volume, [a, b, c]) => {
    return (
      volume +
      dot(vertex(mesh.positions, a), cross(vertex(mesh.positions, b), vertex(mesh.positions, c))) /
        6
    );
  }, 0);
}

function bounds(mesh: Geometry): { min: Vector; max: Vector } {
  const min: Vector = [Infinity, Infinity, Infinity];
  const max: Vector = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < mesh.positions.length / 3; index++) {
    const point = vertex(mesh.positions, index);
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min, max };
}

const samples = [
  { name: "pellet and eye sphere", make: () => sphereGeometry() },
  { name: "coarse sphere", make: () => sphereGeometry(3, 2) },
  { name: "closed-mouth Pac-Man", make: () => pacmanGeometry(0) },
  { name: "open-mouth Pac-Man", make: () => pacmanGeometry(Math.PI / 4) },
  { name: "first ghost hem pose", make: () => ghostGeometry(false) },
  { name: "second ghost hem pose", make: () => ghostGeometry(true) },
];

describe("renderable character and pellet mesh data", () => {
  it.each(samples)("$name has finite, indexed, nondegenerate 3D surfaces", ({ make }) => {
    const mesh = make();
    const vertexCount = mesh.positions.length / 3;
    expect(mesh.positions.length % 3).toBe(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.indices.length % 3).toBe(0);
    expect(vertexCount).toBeGreaterThanOrEqual(4);
    expect(mesh.indices.length).toBeGreaterThanOrEqual(12);
    expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
    expect(Array.from(mesh.normals).every(Number.isFinite)).toBe(true);
    expect(
      Array.from(mesh.indices).every(
        (index) => Number.isInteger(index) && index >= 0 && index < vertexCount,
      ),
    ).toBe(true);
    expect(new Set(mesh.indices).size).toBe(vertexCount);

    for (let index = 0; index < vertexCount; index++) {
      expect(Math.hypot(...vertex(mesh.normals, index))).toBeCloseTo(1, 5);
    }

    for (const [a, b, c] of triangles(mesh)) {
      const face = cross(
        subtract(vertex(mesh.positions, b), vertex(mesh.positions, a)),
        subtract(vertex(mesh.positions, c), vertex(mesh.positions, a)),
      );
      expect(Math.hypot(...face)).toBeGreaterThan(1e-8);
      // Front-face winding must agree with the lighting normals, including caps.
      for (const index of [a, b, c]) {
        expect(dot(face, vertex(mesh.normals, index))).toBeGreaterThan(0);
      }
    }

    const { min, max } = bounds(mesh);
    for (let axis = 0; axis < 3; axis++) {
      expect(max[axis] - min[axis]).toBeGreaterThan(1);
    }
    expect(signedVolume(mesh)).toBeGreaterThan(0.1);
  });

  it.each(samples)("$name is one closed surface even across hard-normal seams", ({ make }) => {
    const mesh = make();
    const welded = new Map<string, number>();
    const remap = Array.from({ length: mesh.positions.length / 3 }, (_, index) => {
      // A lip or hem may duplicate positions to retain a sharp lighting edge.
      const key = vertex(mesh.positions, index)
        .map((value) => Math.round(value * 1e6))
        .join(",");
      if (!welded.has(key)) welded.set(key, welded.size);
      return welded.get(key)!;
    });
    const edges = new Map<string, { count: number; winding: number }>();
    const neighbors = new Map<number, Set<number>>();
    for (const triangle of triangles(mesh)) {
      const face = triangle.map((index) => remap[index]);
      expect(new Set(face).size).toBe(3);
      for (let index = 0; index < 3; index++) {
        const a = face[index];
        const b = face[(index + 1) % 3];
        const key = `${Math.min(a, b)},${Math.max(a, b)}`;
        const edge = edges.get(key) ?? { count: 0, winding: 0 };
        edge.count++;
        edge.winding += a < b ? 1 : -1;
        edges.set(key, edge);
        if (!neighbors.has(a)) neighbors.set(a, new Set());
        neighbors.get(a)!.add(b);
        if (!neighbors.has(b)) neighbors.set(b, new Set());
        neighbors.get(b)!.add(a);
      }
    }
    expect([...edges.values()].every((edge) => edge.count === 2 && edge.winding === 0)).toBe(
      true,
    );
    expect(welded.size - edges.size + mesh.indices.length / 3).toBe(2);
    const reached = new Set([0]);
    for (const index of reached) {
      for (const neighbor of neighbors.get(index) ?? []) reached.add(neighbor);
    }
    expect(reached.size).toBe(welded.size);
  });

  it("keeps the default models detailed enough for rounded silhouettes within a low-poly budget", () => {
    for (const mesh of [sphereGeometry(), pacmanGeometry(Math.PI / 4), ghostGeometry(false)]) {
      expect(mesh.indices.length / 3).toBeGreaterThan(100);
      expect(mesh.positions.length / 3).toBeLessThan(1200);
      expect(mesh.indices.length / 3).toBeLessThan(2200);
    }
  });
});

describe("the sphere shared by pellets and eyes", () => {
  it("has radial normals, surrounds the origin, and encloses approximately a unit sphere", () => {
    const mesh = sphereGeometry();
    for (let index = 0; index < mesh.positions.length / 3; index++) {
      const point = vertex(mesh.positions, index);
      expect(Math.hypot(...point)).toBeCloseTo(1, 5);
      expect(dot(point, vertex(mesh.normals, index))).toBeCloseTo(1, 5);
    }
    const { min, max } = bounds(mesh);
    for (let axis = 0; axis < 3; axis++) {
      expect(min[axis]).toBeCloseTo(-1, 5);
      expect(max[axis]).toBeCloseTo(1, 5);
    }
    expect(signedVolume(mesh) / ((4 * Math.PI) / 3)).toBeGreaterThan(0.9);
    expect(signedVolume(mesh) / ((4 * Math.PI) / 3)).toBeLessThanOrEqual(1);
  });
});

describe("Pac-Man's solid mouth", () => {
  it("removes a forward wedge and seals both cut planes with outward normals", () => {
    const halfAngle = Math.PI / 4;
    const mesh = pacmanGeometry(halfAngle);
    for (let index = 0; index < mesh.positions.length / 3; index++) {
      const [x, y] = vertex(mesh.positions, index);
      if (Math.hypot(x, y) > 1e-6) {
        expect(Math.atan2(Math.abs(y), x)).toBeGreaterThanOrEqual(halfAngle - 1e-6);
      }
    }
    for (const side of [-1, 1]) {
      const outward: Vector = [Math.sin(halfAngle), -side * Math.cos(halfAngle), 0];
      let capArea = 0;
      for (const triangle of triangles(mesh)) {
        if (!triangle.every((index) => dot(vertex(mesh.normals, index), outward) > 1 - 1e-6)) {
          continue;
        }
        const [a, b, c] = triangle.map((index) => vertex(mesh.positions, index));
        for (const point of [a, b, c]) expect(Math.abs(dot(point, outward))).toBeLessThan(1e-6);
        capArea += Math.hypot(...cross(subtract(b, a), subtract(c, a))) / 2;
      }
      // Each cut spans a semicircle, rather than leaving a slit or an open back face.
      expect(capArea).toBeGreaterThan((Math.PI / 2) * 0.9);
      expect(capArea).toBeLessThanOrEqual(Math.PI / 2);
    }
  });

  it("reduces solid volume as the bite opens and closes back to a complete sphere", () => {
    const closed = signedVolume(pacmanGeometry(0));
    const narrow = signedVolume(pacmanGeometry(Math.PI / 6));
    const wide = signedVolume(pacmanGeometry(Math.PI / 3));
    expect(closed / ((4 * Math.PI) / 3)).toBeGreaterThan(0.9);
    expect(narrow).toBeLessThan(closed);
    expect(wide).toBeLessThan(narrow);
    expect(narrow / closed).toBeCloseTo(5 / 6, 1);
    expect(wide / closed).toBeCloseTo(2 / 3, 1);
  });

  it("keeps late death-animation frames finite and outward as the remaining body narrows", () => {
    let previousVolume = signedVolume(pacmanGeometry(0, 24, 12));
    for (const halfAngle of [Math.PI / 2, Math.PI * 0.8, Math.PI * 0.99]) {
      const mesh = pacmanGeometry(halfAngle, 24, 12);
      expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
      const volume = signedVolume(mesh);
      expect(volume).toBeGreaterThan(0);
      expect(volume).toBeLessThan(previousVolume);
      previousVolume = volume;
      for (const [a, b, c] of triangles(mesh)) {
        const face = cross(
          subtract(vertex(mesh.positions, b), vertex(mesh.positions, a)),
          subtract(vertex(mesh.positions, c), vertex(mesh.positions, a)),
        );
        expect(Math.hypot(...face)).toBeGreaterThan(1e-8);
        for (const index of [a, b, c]) {
          expect(dot(face, vertex(mesh.normals, index))).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("ghost body volume and feet", () => {
  it("has a rounded dome, front-to-back depth, and two distinct wavy skirt poses", () => {
    const first = ghostGeometry(false);
    const second = ghostGeometry(true);
    expect(signedVolume(first)).toBeGreaterThan(2);
    expect(signedVolume(second)).toBeGreaterThan(2);
    for (const mesh of [first, second]) {
      const { min, max } = bounds(mesh);
      expect(min[1]).toBeLessThan(-0.9);
      expect(max[1]).toBeGreaterThan(0.9);
      expect(min[2]).toBeLessThan(-0.5);
      expect(max[2]).toBeGreaterThan(0.5);
      const dome = points(mesh).filter(([, y]) => y < -0.5);
      expect(dome.some(([x]) => Math.abs(x) > 0.3 && Math.abs(x) < 0.95)).toBe(true);
      const hem = points(mesh).filter(([x, y, z]) => y > 0.5 && Math.hypot(x, z) > 0.5);
      const hemHeights = hem.map(([, y]) => y);
      expect(Math.max(...hemHeights) - Math.min(...hemHeights)).toBeGreaterThan(0.15);
    }
    const skirt = (mesh: Geometry) =>
      points(mesh)
        .filter(([, y]) => y > 0.5)
        .map((point) => point.map((value) => Math.round(value * 1e5)).join(","));
    expect(new Set(skirt(first))).not.toEqual(new Set(skirt(second)));
    const dome = (mesh: Geometry) =>
      new Set(points(mesh).filter(([, y]) => y < 0.5).map((point) => point.join(",")));
    expect(dome(first)).toEqual(dome(second));
  });
});

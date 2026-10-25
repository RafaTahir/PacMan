/** Indexed, untextured meshes. +Y points down the board and +Z faces the camera. */
export interface Geometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
}

class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly indices: number[] = [];

  vertex(x: number, y: number, z: number, nx = x, ny = y, nz = z): number {
    const index = this.positions.length / 3;
    const length = Math.hypot(nx, ny, nz) || 1;
    this.positions.push(x, y, z);
    this.normals.push(nx / length, ny / length, nz / length);
    return index;
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  finish(): Geometry {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      indices: new Uint16Array(this.indices),
    };
  }
}

/** A unit sphere with unique poles and no zero-area pole triangles. */
export function sphereGeometry(longitudes = 16, latitudes = 10): Geometry {
  const columns = Math.max(3, Math.min(64, Math.floor(longitudes)));
  const rows = Math.max(2, Math.min(32, Math.floor(latitudes)));
  const mesh = new MeshBuilder();
  const north = mesh.vertex(0, 0, 1);
  const rings: number[][] = [];
  for (let row = 1; row < rows; row++) {
    const polar = (row * Math.PI) / rows;
    const radius = Math.sin(polar);
    const ring: number[] = [];
    for (let column = 0; column < columns; column++) {
      const angle = (column * Math.PI * 2) / columns;
      ring.push(
        mesh.vertex(radius * Math.cos(angle), radius * Math.sin(angle), Math.cos(polar)),
      );
    }
    rings.push(ring);
  }
  const south = mesh.vertex(0, 0, -1);
  for (let column = 0; column < columns; column++) {
    const next = (column + 1) % columns;
    mesh.triangle(north, rings[0][column], rings[0][next]);
    for (let row = 0; row < rings.length - 1; row++) {
      const a = rings[row][column];
      const b = rings[row][next];
      const c = rings[row + 1][column];
      const d = rings[row + 1][next];
      mesh.triangle(a, c, b);
      mesh.triangle(b, c, d);
    }
    const last = rings[rings.length - 1];
    mesh.triangle(last[column], south, last[next]);
  }
  return mesh.finish();
}

/**
 * A sphere with a complete longitudinal wedge removed toward +X. Each cut
 * has its own planar semicircular cap, so the mouth is a closed solid rather
 * than a hole exposing back faces. Separate cap vertices retain the sharp lip.
 */
export function pacmanGeometry(
  mouthHalfAngle: number,
  longitudes = 28,
  latitudes = 14,
): Geometry {
  if (mouthHalfAngle <= 0.0001) return sphereGeometry(longitudes, latitudes);
  const mouth = Math.min(Math.PI - 0.0001, Math.max(0.0001, mouthHalfAngle));
  const columns = Math.max(4, Math.min(64, Math.floor(longitudes)));
  const rows = Math.max(3, Math.min(32, Math.floor(latitudes)));
  const mesh = new MeshBuilder();
  const north = mesh.vertex(0, 0, 1);
  const rings: number[][] = [];
  for (let row = 1; row < rows; row++) {
    const polar = (row * Math.PI) / rows;
    const radius = Math.sin(polar);
    const ring: number[] = [];
    for (let column = 0; column <= columns; column++) {
      const angle = mouth + (column * (Math.PI * 2 - mouth * 2)) / columns;
      ring.push(
        mesh.vertex(radius * Math.cos(angle), radius * Math.sin(angle), Math.cos(polar)),
      );
    }
    rings.push(ring);
  }
  const south = mesh.vertex(0, 0, -1);
  for (let column = 0; column < columns; column++) {
    mesh.triangle(north, rings[0][column], rings[0][column + 1]);
    for (let row = 0; row < rings.length - 1; row++) {
      const a = rings[row][column];
      const b = rings[row][column + 1];
      const c = rings[row + 1][column];
      const d = rings[row + 1][column + 1];
      mesh.triangle(a, c, b);
      mesh.triangle(b, c, d);
    }
    const last = rings[rings.length - 1];
    mesh.triangle(last[column], south, last[column + 1]);
  }

  for (const side of [-1, 1]) {
    const angle = side * mouth;
    const nx = Math.sin(mouth);
    const ny = -side * Math.cos(mouth);
    const center = mesh.vertex(0, 0, 0, nx, ny, 0);
    let previous = mesh.vertex(0, 0, 1, nx, ny, 0);
    for (let row = 1; row <= rows; row++) {
      const polar = (row * Math.PI) / rows;
      const radius = row === rows ? 0 : Math.sin(polar);
      const current = mesh.vertex(
        radius * Math.cos(angle),
        radius * Math.sin(angle),
        row === rows ? -1 : Math.cos(polar),
        nx,
        ny,
        0,
      );
      if (side === 1) mesh.triangle(center, current, previous);
      else mesh.triangle(center, previous, current);
      previous = current;
    }
  }
  return mesh.finish();
}

/** Rounded, closed ghost body with two cached hem poses and real depth. */
export function ghostGeometry(feetVariant: boolean): Geometry {
  const sides = 24;
  const domeRows = 8;
  const depth = 0.64;
  const domeHeight = 0.85;
  const mesh = new MeshBuilder();
  const top = mesh.vertex(0, -1, 0, 0, -1, 0);
  const rings: number[][] = [];

  for (let row = 1; row <= domeRows; row++) {
    const polar = (row * Math.PI) / (domeRows * 2);
    const radius = Math.sin(polar);
    const y = -0.15 - domeHeight * Math.cos(polar);
    const ring: number[] = [];
    for (let column = 0; column < sides; column++) {
      const angle = (column * Math.PI * 2) / sides;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      ring.push(
        mesh.vertex(
          radius * cosine,
          y,
          depth * radius * sine,
          radius * cosine,
          -Math.cos(polar) / domeHeight,
          (radius * sine) / depth,
        ),
      );
    }
    rings.push(ring);
  }

  const hem: number[] = [];
  const hemPhase = feetVariant ? Math.PI : 0;
  for (let column = 0; column < sides; column++) {
    const angle = (column * Math.PI * 2) / sides;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    hem.push(
      mesh.vertex(
        cosine,
        0.88 + Math.cos(angle * 6 + hemPhase) * 0.12,
        depth * sine,
        cosine,
        0,
        sine / depth,
      ),
    );
  }
  rings.push(hem);

  for (let column = 0; column < sides; column++) {
    const next = (column + 1) % sides;
    mesh.triangle(top, rings[0][column], rings[0][next]);
    for (let row = 0; row < rings.length - 1; row++) {
      const a = rings[row][column];
      const b = rings[row][next];
      const c = rings[row + 1][column];
      const d = rings[row + 1][next];
      mesh.triangle(a, c, b);
      mesh.triangle(b, c, d);
    }
  }

  // Close the underside with separate vertices for its hard fabric edge.
  for (let column = 0; column < sides; column++) {
    const next = (column + 1) % sides;
    const a = hem[column] * 3;
    const b = hem[next] * 3;
    const ax = mesh.positions[a];
    const ay = mesh.positions[a + 1];
    const az = mesh.positions[a + 2];
    const bx = mesh.positions[b];
    const by = mesh.positions[b + 1];
    const bz = mesh.positions[b + 2];
    const centerY = 0.88;
    const nx = (by - centerY) * az - bz * (ay - centerY);
    const ny = bz * ax - bx * az;
    const nz = bx * (ay - centerY) - (by - centerY) * ax;
    const center = mesh.vertex(0, centerY, 0, nx, ny, nz);
    const first = mesh.vertex(ax, ay, az, nx, ny, nz);
    const second = mesh.vertex(bx, by, bz, nx, ny, nz);
    mesh.triangle(center, second, first);
  }
  return mesh.finish();
}

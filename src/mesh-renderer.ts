import { COLS, ROWS } from "./maze";
import { getLevelConfig } from "./levels";
import type { Direction, GameState, Ghost, GhostId } from "./types";
import { ghostGeometry, pacmanGeometry, sphereGeometry } from "./mesh-geometry";
import type { Geometry } from "./mesh-geometry";

const TILE = 24;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;
const TAU = Math.PI * 2;
const PAC_FRAMES = 10;
const DEATH_FRAMES = 12;
type Color = readonly [number, number, number];
const GOLD: Color = [1, 0.81, 0.075];
const DOT: Color = [1, 0.83, 0.65];
const WHITE: Color = [1, 0.98, 0.94];
const BLUE: Color = [0.045, 0.17, 0.62];
const FRIGHTENED: Color = [0.13, 0.23, 0.89];
const FRIGHT_FACE: Color = [1, 0.92, 0.69];
const FLASH_FACE: Color = [0.96, 0.14, 0.22];
const COLORS: Record<GhostId, Color> = {
  blinky: [1, 0.25, 0.33],
  pinky: [1, 0.66, 0.83],
  inky: [0.23, 0.88, 0.95],
  clyde: [1, 0.61, 0.25],
};
const VECTORS: Record<Direction, readonly [number, number]> = {
  right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
};
const ANGLES: Record<Direction, number> = {
  right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2,
};

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uModel;
uniform mat3 uNormal;
varying vec3 vNormal;
void main() {
  vNormal = uNormal * aNormal;
  gl_Position = uProjection * uModel * vec4(aPosition, 1.0);
}`;
const FRAGMENT_SHADER = `
precision mediump float;
uniform vec3 uColor;
varying vec3 vNormal;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(vec3(-0.48, -0.64, 1.0));
  float diffuse = max(dot(normal, light), 0.0);
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  float specular = pow(max(dot(normal, halfway), 0.0), 28.0);
  vec3 surface = uColor * (0.38 + 0.62 * diffuse);
  surface += vec3(1.0, 0.98, 0.91) * specular * 0.26;
  gl_FragColor = vec4(surface, 1.0);
}`;

interface GpuMesh {
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  indexCount: number;
  vertexCount: number;
}
interface ShaderLocations {
  position: number;
  normal: number;
  projection: WebGLUniformLocation;
  model: WebGLUniformLocation;
  normalMatrix: WebGLUniformLocation;
  color: WebGLUniformLocation;
}

/** Transform a CPU mesh once, retaining correct normals for ellipsoids. */
function transformed(
  geometry: Geometry,
  x: number, y: number, z: number,
  sx: number, sy = sx, sz = sx,
): Geometry {
  const positions = new Float32Array(geometry.positions.length);
  const normals = new Float32Array(geometry.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = geometry.positions[i] * sx + x;
    positions[i + 1] = geometry.positions[i + 1] * sy + y;
    positions[i + 2] = geometry.positions[i + 2] * sz + z;
    const nx = geometry.normals[i] / sx;
    const ny = geometry.normals[i + 1] / sy;
    const nz = geometry.normals[i + 2] / sz;
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / length;
    normals[i + 1] = ny / length;
    normals[i + 2] = nz / length;
  }
  return { positions, normals, indices: geometry.indices };
}

function merged(parts: Geometry[]): Geometry {
  const vertices = parts.reduce((total, mesh) => total + mesh.positions.length, 0);
  const indexCount = parts.reduce((total, mesh) => total + mesh.indices.length, 0);
  const positions = new Float32Array(vertices);
  const normals = new Float32Array(vertices);
  const indices = new Uint16Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    positions.set(part.positions, vertexOffset);
    normals.set(part.normals, vertexOffset);
    const base = vertexOffset / 3;
    for (let i = 0; i < part.indices.length; i++) indices[indexOffset++] = base + part.indices[i];
    vertexOffset += part.positions.length;
  }
  return { positions, normals, indices };
}

/** Twelve shared vertices give every tiny dot genuine depth at twenty triangles. */
function icosphere(): Geometry {
  const t = (1 + Math.sqrt(5)) / 2;
  const vertices = [
    -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0,
    0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t,
    t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1,
  ];
  for (let i = 0; i < vertices.length; i += 3) {
    const length = Math.hypot(vertices[i], vertices[i + 1], vertices[i + 2]);
    vertices[i] /= length;
    vertices[i + 1] /= length;
    vertices[i + 2] /= length;
  }
  const positions = new Float32Array(vertices);
  return {
    positions,
    normals: positions.slice(),
    indices: new Uint16Array([
      0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
      1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
      3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
      4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
    ]),
  };
}

/** A short closed hexagonal tube, used for the frightened zigzag mouth. */
function faceSegment(ax: number, ay: number, bx: number, by: number): Geometry {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const sides = 6;
  for (let end = 0; end < 2; end++) {
    for (let i = 0; i < sides; i++) {
      const angle = i * TAU / sides;
      const nx = -dy / length * Math.cos(angle);
      const ny = dx / length * Math.cos(angle);
      const nz = Math.sin(angle);
      positions.push((end ? bx : ax) + nx * 0.85, (end ? by : ay) + ny * 0.85, 10.7 + nz * 0.85);
      normals.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    indices.push(i, next, i + sides, next, next + sides, i + sides);
  }
  // Hard-normal end caps close each piece of the face mesh.
  for (let end = 0; end < 2; end++) {
    const sign = end ? 1 : -1;
    const base = positions.length / 3;
    positions.push(end ? bx : ax, end ? by : ay, 10.7);
    normals.push(sign * dx / length, sign * dy / length, 0);
    for (let i = 0; i < sides; i++) {
      const vertex = (end * sides + i) * 3;
      positions.push(positions[vertex], positions[vertex + 1], positions[vertex + 2]);
      normals.push(sign * dx / length, sign * dy / length, 0);
    }
    for (let i = 0; i < sides; i++) indices.push(base, base + 1 + i, base + 1 + (i + 1) % sides);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

/**
 * A transparent WebGL layer composited over the unchanged, orthographic maze.
 * All shapes are indexed solids; Canvas 2D remains the unavailable/context-loss fallback.
 */
export class MeshRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private locations: ShaderLocations | null = null;
  private meshes: GpuMesh[] = [];
  private pacman: GpuMesh[] = [];
  private death: GpuMesh[] = [];
  private ghosts: GpuMesh[] = [];
  private eyes: GpuMesh | null = null;
  private pupils: GpuMesh | null = null;
  private frightenedFace: GpuMesh | null = null;
  private energizer: GpuMesh | null = null;
  private pellets: GpuMesh | null = null;
  private pelletSource: Set<number> | null = null;
  private pelletCount = -1;
  private energizerCount = 0;
  private pelletBatchBuilds = 0;
  private contextLost = false;
  private reason: string | null = "WebGL has not initialized.";
  private drawCalls = 0;
  private submittedTriangles = 0;
  private submittedVertices = 0;
  private readonly model = new Float32Array(16);
  private readonly normal = new Float32Array(9);
  private readonly projection = new Float32Array([
    2 / WIDTH, 0, 0, 0,
    0, -2 / HEIGHT, 0, 0,
    0, 0, -1 / 64, 0,
    -1, 1, 0, 1,
  ]);

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.reason = "WebGL context lost; Canvas drawing is active until restoration.";
      // The browser has invalidated these resources; do not delete stale handles
      // against the restored context when it creates its replacement buffers.
      this.forgetResources();
      this.resetFrameStatistics();
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
      this.initialize();
    });
    try {
      this.gl = this.canvas.getContext("webgl", {
        alpha: true, depth: true, stencil: false, antialias: false,
        premultipliedAlpha: true,
        // The parent copies this layer synchronously after render. Avoid retaining
        // or multisampling the framebuffer; immediate render/readPixels still works.
        preserveDrawingBuffer: false,
      });
    } catch {
      this.gl = null;
    }
    if (this.gl) this.initialize();
    else this.reason = "WebGL is unavailable in this browser; Canvas drawing is active.";
  }

  get available(): boolean {
    return this.gl !== null && this.program !== null && !this.contextLost;
  }

  get diagnostics() {
    return {
      backend: this.available ? "webgl" : "canvas-fallback",
      available: this.available,
      reason: this.reason,
      meshCount: this.meshes.length,
      cachedTriangles: this.meshes.reduce((total, mesh) => total + mesh.indexCount / 3, 0),
      drawCalls: this.drawCalls,
      submittedTriangles: this.submittedTriangles,
      submittedVertices: this.submittedVertices,
      pelletCount: Math.max(0, this.pelletCount),
      energizerCount: this.energizerCount,
      pelletBatchBuilds: this.pelletBatchBuilds,
      contextLost: this.contextLost,
    };
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  clear(): void {
    this.resetFrameStatistics();
    if (!this.available) return;
    const gl = this.gl!;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  render(state: GameState, options: { reducedMotion: boolean }): boolean {
    this.resetFrameStatistics();
    if (!this.available) return false;
    const gl = this.gl!;
    const locations = this.locations!;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(locations.position);
    gl.enableVertexAttribArray(locations.normal);
    gl.uniformMatrix4fv(locations.projection, false, this.projection);

    this.updatePellets(state.pellets);
    this.energizerCount = state.energizers.size;
    this.draw(this.pellets!, DOT, 0, 0, 0, 1);
    const pulse = options.reducedMotion ? 1 : 0.91 + Math.sin(state.time * 5) * 0.09;
    for (const index of state.energizers) {
      this.draw(this.energizer!, DOT, ((index % COLS) + 0.5) * TILE,
        (Math.floor(index / COLS) + 0.5) * TILE, 2.8, 6.2 * pulse);
    }
    if (state.phase !== "dying" || state.phaseTime < 0.4) {
      for (const ghost of state.ghosts) {
        this.drawWrapped(ghost.x, ghost.y, (x, y) => this.drawGhost(ghost, x, y, state, options.reducedMotion));
      }
    }
    this.drawWrapped(state.pacman.x, state.pacman.y,
      (x, y) => this.drawPacman(x, y, state, options.reducedMotion));
    return this.available;
  }

  private initialize(): void {
    const gl = this.gl!;
    this.disposeResources();
    this.pelletSource = null;
    this.pelletCount = -1;
    this.resetFrameStatistics();
    let vertex: WebGLShader | null = null;
    let fragment: WebGLShader | null = null;
    try {
      vertex = this.compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      fragment = this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      const program = gl.createProgram();
      if (!program) throw new Error("program");
      this.program = program;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link");
      const uniform = (name: string) => {
        const location = gl.getUniformLocation(program, name);
        if (location === null) throw new Error("uniform");
        return location;
      };
      this.locations = {
        position: gl.getAttribLocation(program, "aPosition"),
        normal: gl.getAttribLocation(program, "aNormal"),
        projection: uniform("uProjection"), model: uniform("uModel"),
        normalMatrix: uniform("uNormal"), color: uniform("uColor"),
      };
      if (this.locations.position < 0 || this.locations.normal < 0) throw new Error("attributes");
      this.pacman = Array.from({ length: PAC_FRAMES }, (_, i) =>
        this.upload(pacmanGeometry(0.04 + i / (PAC_FRAMES - 1) * 0.44, 24, 12)));
      this.death = Array.from({ length: DEATH_FRAMES }, (_, i) =>
        this.upload(pacmanGeometry(i / (DEATH_FRAMES - 1) * Math.PI * 0.99, 24, 12)));
      this.ghosts = [this.upload(ghostGeometry(false)), this.upload(ghostGeometry(true))];
      const eye = sphereGeometry(12, 8);
      this.eyes = this.upload(merged([-6.7, 6.7].map((x) => transformed(eye, x, -3.2, 10.5, 5.2, 6.3, 3.7))));
      this.pupils = this.upload(merged([-6.7, 6.7].map((x) => transformed(eye, x, -3.2, 13.9, 2.8, 3.5, 1.8))));
      const small = sphereGeometry(8, 6);
      const face = [-6, 6].map((x) => transformed(small, x, -3.0, 10.7, 1.9, 2.4, 1.5));
      for (let i = 0; i < 6; i++) face.push(faceSegment(-8 + i * 8 / 3, i % 2 ? 4.3 : 6.9,
        -8 + (i + 1) * 8 / 3, i % 2 ? 6.9 : 4.3));
      this.frightenedFace = this.upload(merged(face));
      this.energizer = this.upload(sphereGeometry(12, 8));
      this.pellets = this.upload(merged([]));
      this.reason = null;
    } catch {
      this.disposeResources();
      this.reason = "WebGL mesh initialization failed; Canvas drawing is active.";
    } finally {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error("shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error("compile");
    }
    return shader;
  }

  private upload(geometry: Geometry): GpuMesh {
    const gl = this.gl!;
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vertexBuffer || !indexBuffer) {
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
      throw new Error("buffer");
    }
    const mesh = { vertexBuffer, indexBuffer, indexCount: 0, vertexCount: 0 };
    this.meshes.push(mesh);
    this.writeMesh(mesh, geometry);
    return mesh;
  }

  private writeMesh(mesh: GpuMesh, geometry: Geometry): void {
    const gl = this.gl!;
    const interleaved = new Float32Array(geometry.positions.length * 2);
    for (let i = 0; i < geometry.positions.length; i += 3) {
      interleaved.set(geometry.positions.subarray(i, i + 3), i * 2);
      interleaved.set(geometry.normals.subarray(i, i + 3), i * 2 + 3);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    mesh.indexCount = geometry.indices.length;
    mesh.vertexCount = geometry.positions.length / 3;
  }

  private updatePellets(source: Set<number>): void {
    if (this.pelletSource === source && this.pelletCount === source.size) return;
    const unit = icosphere();
    const parts: Geometry[] = [];
    for (const index of source) parts.push(transformed(unit, ((index % COLS) + 0.5) * TILE,
      (Math.floor(index / COLS) + 0.5) * TILE, 1.8, 2.35));
    this.writeMesh(this.pellets!, merged(parts));
    this.pelletSource = source;
    this.pelletCount = source.size;
    this.pelletBatchBuilds++;
  }

  private draw(
    mesh: GpuMesh, color: Color, x: number, y: number, z: number,
    sx: number, sy = sx, sz = sx, angle = 0, tilt = 0,
  ): void {
    if (!mesh.indexCount) return;
    const gl = this.gl!;
    const locations = this.locations!;
    const c = Math.cos(angle), s = Math.sin(angle);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const model = this.model;
    model[0] = c * sx; model[1] = s * sx; model[2] = 0; model[3] = 0;
    model[4] = -s * ct * sy; model[5] = c * ct * sy; model[6] = st * sy; model[7] = 0;
    model[8] = s * st * sz; model[9] = -c * st * sz; model[10] = ct * sz; model[11] = 0;
    model[12] = x; model[13] = y; model[14] = z; model[15] = 1;
    const normal = this.normal;
    normal[0] = c / sx; normal[1] = s / sx; normal[2] = 0;
    normal[3] = -s * ct / sy; normal[4] = c * ct / sy; normal[5] = st / sy;
    normal[6] = s * st / sz; normal[7] = -c * st / sz; normal[8] = ct / sz;
    gl.uniformMatrix4fv(locations.model, false, model);
    gl.uniformMatrix3fv(locations.normalMatrix, false, normal);
    gl.uniform3f(locations.color, color[0], color[1], color[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
    this.drawCalls++;
    this.submittedTriangles += mesh.indexCount / 3;
    this.submittedVertices += mesh.indexCount;
  }

  private drawPacman(x: number, y: number, state: GameState, reducedMotion: boolean): void {
    let angle = ANGLES[state.pacman.dir];
    let mesh: GpuMesh;
    if (state.phase === "dying") {
      const progress = Math.min(1, Math.max(0, (state.phaseTime - 0.35) / 1.2));
      if (progress > 0.97) return;
      angle = -Math.PI / 2;
      mesh = this.death[Math.min(DEATH_FRAMES - 1, Math.round(progress * (DEATH_FRAMES - 1)))];
    } else {
      const mouth = reducedMotion || !state.pacman.moving ? 0.22 : 0.08 + (Math.sin(state.time * 23) + 1) * 0.19;
      const frame = Math.max(0, Math.min(PAC_FRAMES - 1, Math.round((mouth - 0.04) / 0.44 * (PAC_FRAMES - 1))));
      mesh = this.pacman[frame];
    }
    // Only the model tilts slightly, exposing its solid mouth cap; board centers stay fixed.
    this.draw(mesh, GOLD, x, y, 4, 17, 17, 17, angle, 0.12);
  }

  private drawGhost(ghost: Ghost, x: number, y: number, state: GameState, reducedMotion: boolean): void {
    const frightened = ghost.mode === "frightened" || (ghost.mode !== "eyes" && ghost.frightenedVisual === true);
    const config = getLevelConfig(state.level);
    const flashWindow = Math.min(config.frightenedSeconds, config.frightenedFlashes * 0.4);
    const flashProgress = flashWindow > 0 ? 1 - state.frightenedRemaining / flashWindow : -1;
    const flash = frightened && !reducedMotion && flashProgress >= 0 &&
      Math.floor(flashProgress * config.frightenedFlashes * 2) % 2 === 0;
    if (ghost.mode !== "eyes") {
      const pose = reducedMotion ? 0 : Math.floor(state.time * 9) % 2;
      this.draw(this.ghosts[pose], frightened ? flash ? WHITE : FRIGHTENED : COLORS[ghost.id], x, y, 3, 16);
    }
    if (frightened) this.draw(this.frightenedFace!, flash ? FLASH_FACE : FRIGHT_FACE, x, y, 3, 1);
    else {
      const [dx, dy] = VECTORS[ghost.dir];
      this.draw(this.eyes!, WHITE, x + dx * 0.6, y + dy * 0.5, 3, 1);
      this.draw(this.pupils!, BLUE, x + dx * 3.0, y + dy * 3.2, 3, 1);
    }
  }

  private drawWrapped(x: number, y: number, draw: (x: number, y: number) => void): void {
    draw((x + 0.5) * TILE, (y + 0.5) * TILE);
    if (x < 0.5) draw((x + COLS + 0.5) * TILE, (y + 0.5) * TILE);
    if (x > COLS - 1.5) draw((x - COLS + 0.5) * TILE, (y + 0.5) * TILE);
  }

  private resetFrameStatistics(): void {
    this.drawCalls = 0;
    this.submittedTriangles = 0;
    this.submittedVertices = 0;
  }

  private disposeResources(): void {
    const gl = this.gl!;
    for (const mesh of this.meshes) {
      gl.deleteBuffer(mesh.vertexBuffer);
      gl.deleteBuffer(mesh.indexBuffer);
    }
    if (this.program) gl.deleteProgram(this.program);
    this.forgetResources();
  }

  private forgetResources(): void {
    this.meshes = [];
    this.pacman = [];
    this.death = [];
    this.ghosts = [];
    this.eyes = this.pupils = this.frightenedFace = this.energizer = this.pellets = null;
    this.program = null;
    this.locations = null;
  }
}

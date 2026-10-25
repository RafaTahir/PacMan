import { COLS, ROWS, MAZE } from "./maze";
import { MeshRenderer } from "./mesh-renderer";
import { getLevelConfig } from "./levels";
import type { Direction, FruitKind, GameState, Ghost } from "./types";

const TILE = 24;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;
const TAU = Math.PI * 2;
const COLORS = {
  blinky: "#ff5265",
  pinky: "#ffb5dd",
  inky: "#54e4ef",
  clyde: "#ffb65b",
};
const VECTORS: Record<Direction, [number, number]> = {
  right: [1, 0],
  left: [-1, 0],
  up: [0, -1],
  down: [0, 1],
};
type Point = { x: number; y: number };

/** Trace the boundary of each connected wall, avoiding a grid of outlined tiles. */
function mazeOutline(): Path2D {
  const edges = new Map<string, Point[]>();
  const key = (p: Point) => `${p.x},${p.y}`;
  const wall = (x: number, y: number) => MAZE[y]?.[x] === "#";
  const edge = (x: number, y: number, xx: number, yy: number) => {
    const k = `${x},${y}`;
    const list = edges.get(k) ?? [];
    list.push({ x: xx, y: yy });
    edges.set(k, list);
  };
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (!wall(x, y)) continue;
      if (!wall(x, y - 1)) edge(x, y, x + 1, y);
      if (!wall(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!wall(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!wall(x - 1, y)) edge(x, y + 1, x, y);
    }
  const path = new Path2D();
  while (edges.size) {
    const startKey = edges.keys().next().value!;
    const [sx, sy] = startKey.split(",").map(Number);
    const points: Point[] = [];
    let current = { x: sx, y: sy };
    let limit = COLS * ROWS * 4;
    do {
      points.push(current);
      const list = edges.get(key(current));
      if (!list?.length) break;
      const next = list.pop()!;
      if (!list.length) edges.delete(key(current));
      current = next;
    } while (key(current) !== startKey && --limit > 0);
    if (points.length < 3) continue;
    // Remove collinear vertices so curves only soften actual wall corners.
    const corners = points.filter((p, i) => {
      const a = points[(i + points.length - 1) % points.length];
      const b = points[(i + 1) % points.length];
      return (p.x - a.x) * (b.y - p.y) !== (p.y - a.y) * (b.x - p.x);
    });
    if (corners.length < 3) continue;
    corners.forEach((p, i) => {
      const prev = corners[(i + corners.length - 1) % corners.length];
      const next = corners[(i + 1) % corners.length];
      const radius = 0.21;
      const before = {
        x: p.x + Math.sign(prev.x - p.x) * radius,
        y: p.y + Math.sign(prev.y - p.y) * radius,
      };
      const after = {
        x: p.x + Math.sign(next.x - p.x) * radius,
        y: p.y + Math.sign(next.y - p.y) * radius,
      };
      if (i === 0) path.moveTo(before.x * TILE, before.y * TILE);
      else path.lineTo(before.x * TILE, before.y * TILE);
      path.quadraticCurveTo(
        p.x * TILE,
        p.y * TILE,
        after.x * TILE,
        after.y * TILE,
      );
    });
    path.closePath();
  }
  return path;
}

export function drawFruit(
  ctx: CanvasRenderingContext2D,
  kind: FruitKind,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const ellipse = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: string,
  ) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
  };
  const stem = () => {
    ctx.strokeStyle = "#b9d67b";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(1, -8, 4, -10);
    ctx.stroke();
    ellipse(5, -7, 4, 1.7, "#70dc91");
  };
  if (kind === "cherry") {
    ctx.strokeStyle = "#88ce8c";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-5, 3);
    ctx.quadraticCurveTo(-4, -5, 3, -9);
    ctx.quadraticCurveTo(3, -1, 7, 5);
    ctx.stroke();
    ellipse(-5, 5, 5, 5.5, "#ff4865");
    ellipse(7, 7, 5, 5.5, "#f43d54");
    ellipse(-6.5, 3, 1.5, 1.6, "#ffc9d1");
    ellipse(5.5, 5, 1.3, 1.5, "#ffb3c1");
  } else if (kind === "strawberry") {
    ctx.fillStyle = "#ff536b";
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.bezierCurveTo(-9, -10, 9, -10, 9, -3);
    ctx.quadraticCurveTo(7, 6, 0, 11);
    ctx.quadraticCurveTo(-7, 6, -9, -3);
    ctx.fill();
    ctx.fillStyle = "#7ddb85";
    ctx.beginPath();
    ctx.moveTo(-8, -7);
    ctx.lineTo(-3, -10);
    ctx.lineTo(0, -7);
    ctx.lineTo(4, -10);
    ctx.lineTo(8, -7);
    ctx.lineTo(1, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffedb3";
    for (const [a, b] of [
      [-4, -1],
      [3, -1],
      [-2, 4],
      [2, 6],
    ])
      ctx.fillRect(a, b, 1.4, 2);
  } else if (kind === "orange" || kind === "apple" || kind === "melon") {
    const color =
      kind === "orange" ? "#ffb33f" : kind === "apple" ? "#ff5262" : "#87d788";
    ellipse(0, 2, 9, 9, color);
    if (kind === "apple") {
      ellipse(-4, -3, 5, 5, color);
      ellipse(4, -3, 5, 5, color);
    }
    if (kind === "melon") {
      ctx.strokeStyle = "#d3f5a2";
      ctx.lineWidth = 1;
      for (let i = -6; i <= 6; i += 4) {
        ctx.beginPath();
        ctx.ellipse(0, 2, Math.abs(i) + 1, 8, 0, 0, TAU);
        ctx.stroke();
      }
    }
    ellipse(-3.5, -1, 2, 3, kind === "melon" ? "#d3f5a2" : "#ffe4a0");
    stem();
  } else if (kind === "galaxian") {
    ctx.fillStyle = "#6ce8f3";
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(4, -1);
    ctx.lineTo(11, 7);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 10);
    ctx.lineTo(-4, 5);
    ctx.lineTo(-11, 7);
    ctx.lineTo(-4, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ff6c6b";
    ctx.fillRect(-10, -4, 3, 10);
    ctx.fillRect(7, -4, 3, 10);
    ctx.fillStyle = "#ffe35b";
    ctx.fillRect(-2, -4, 4, 12);
  } else if (kind === "bell") {
    ctx.fillStyle = "#ffd95b";
    ctx.beginPath();
    ctx.moveTo(-10, 7);
    ctx.quadraticCurveTo(-7, 2, -7, -3);
    ctx.quadraticCurveTo(-6, -10, 0, -10);
    ctx.quadraticCurveTo(6, -10, 7, -3);
    ctx.quadraticCurveTo(7, 2, 10, 7);
    ctx.closePath();
    ctx.fill();
    ellipse(0, 8, 10, 2.2, "#fff1a0");
    ellipse(0, 11, 2.4, 1.8, "#ffad45");
  } else {
    ctx.strokeStyle = "#7cddec";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -6, 4.5, 0, TAU);
    ctx.moveTo(0, -1);
    ctx.lineTo(0, 11);
    ctx.lineTo(5, 11);
    ctx.moveTo(0, 6);
    ctx.lineTo(4, 6);
    ctx.stroke();
    ctx.strokeStyle = "#e1fbff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.lineTo(-1, 10);
    ctx.stroke();
  }
  ctx.restore();
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly outline: Path2D;
  private readonly walls: HTMLCanvasElement;
  private readonly ghostBodies = new Map<string, HTMLCanvasElement>();
  private readonly meshes = new MeshRenderer();
  private meshScale = 1;
  private meshCost = 0;
  private meshSamples = 0;

  get graphicsInfo() {
    return {
      ...this.meshes.diagnostics,
      renderScale: this.meshScale,
      renderPixels: [this.meshes.canvas.width, this.meshes.canvas.height],
    };
  }

  get meshCanvas(): HTMLCanvasElement {
    return this.meshes.canvas;
  }

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("This browser does not support Canvas 2D.");
    this.ctx = ctx;
    this.outline = mazeOutline();
    this.walls = document.createElement("canvas");
    this.walls.width = WIDTH * 2;
    this.walls.height = HEIGHT * 2;
    const w = this.walls.getContext("2d")!;
    w.scale(2, 2);
    w.fillStyle = "#03070f";
    w.fillRect(0, 0, WIDTH, HEIGHT);
    w.lineJoin = "round";
    w.lineCap = "round";
    // A cached shallow extrusion leaves the playfield overhead and the paths clear.
    w.save();
    w.translate(2.2, 3.4);
    w.shadowColor = "rgba(0, 0, 0, .8)";
    w.shadowBlur = 5;
    w.shadowOffsetY = 2;
    w.fillStyle = "#061126";
    w.fill(this.outline, "evenodd");
    w.strokeStyle = "#07162c";
    w.lineWidth = 2;
    w.stroke(this.outline);
    w.restore();
    const surface = w.createLinearGradient(0, 0, WIDTH, HEIGHT);
    surface.addColorStop(0, "#173b6c");
    surface.addColorStop(0.5, "#102a51");
    surface.addColorStop(1, "#0c2347");
    w.fillStyle = surface;
    w.fill(this.outline, "evenodd");
    w.save();
    w.clip(this.outline, "evenodd");
    w.strokeStyle = "#1d4279";
    w.lineWidth = 7;
    w.stroke(this.outline);
    w.save();
    w.translate(1.8, 2);
    w.strokeStyle = "#4c88dc";
    w.lineWidth = 2.3;
    w.stroke(this.outline);
    w.restore();
    w.save();
    w.translate(-1.5, -2);
    w.strokeStyle = "#091a36";
    w.lineWidth = 2.5;
    w.stroke(this.outline);
    w.restore();
    w.restore();
    w.strokeStyle = "#2b64bb";
    w.lineWidth = 1.1;
    w.stroke(this.outline);
    this.resize();
  }

  resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    // Bound the fill rate on high-density phones and very large desktop views.
    const cssWidth = bounds.width || WIDTH;
    const pixelBudgetDpr = Math.sqrt(
      1_250_000 / ((cssWidth * cssWidth * ROWS) / COLS),
    );
    const dpr = Math.min(window.devicePixelRatio || 1, 2, pixelBudgetDpr);
    const width = Math.max(1, Math.round((bounds.width || WIDTH) * dpr));
    const height = Math.max(1, Math.round((width * ROWS) / COLS));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.meshes.resize(
      Math.max(1, Math.round(width * this.meshScale)),
      Math.max(1, Math.round(height * this.meshScale)),
    );
  }

  render(state: GameState, options: { reducedMotion: boolean; highContrast?: boolean }): void {
    const started = performance.now();
    this.resize();
    const ctx = this.ctx;
    ctx.setTransform(
      this.canvas.width / WIDTH,
      0,
      0,
      this.canvas.height / HEIGHT,
      0,
      0,
    );
    ctx.globalAlpha = 1;
    ctx.drawImage(this.walls, 0, 0, WIDTH, HEIGHT);
    if (options.highContrast) {
      ctx.strokeStyle = "#8fcdff";
      ctx.lineWidth = 1.8;
      ctx.stroke(this.outline);
    }
    if (
      state.phase === "level-clear" &&
      (options.reducedMotion || Math.floor(state.phaseTime * 4) % 2 === 0)
    ) {
      ctx.strokeStyle = "#d5eeff";
      ctx.lineWidth = 2.2;
      ctx.stroke(this.outline);
    }
    const meshFrame = this.meshes.render(state, options);
    if (!meshFrame) {
      ctx.fillStyle = "#edcba4";
      for (const index of state.pellets) {
        const x = ((index % COLS) + 0.5) * TILE,
          y = (Math.floor(index / COLS) + 0.5) * TILE;
        ctx.beginPath();
        ctx.arc(x, y, 2.1, 0, TAU);
        ctx.fill();
      }
      for (const index of state.energizers) {
        const x = ((index % COLS) + 0.5) * TILE,
          y = (Math.floor(index / COLS) + 0.5) * TILE;
        const pulse = options.reducedMotion
          ? 1
          : 0.82 + Math.sin(state.time * 5) * 0.18;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#ffe6b9";
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = "#f6a6d3";
    ctx.lineWidth = 2.5;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (MAZE[y][x] === "-") {
          ctx.beginPath();
          ctx.moveTo(x * TILE, (y + 0.5) * TILE);
          ctx.lineTo((x + 1) * TILE, (y + 0.5) * TILE);
          ctx.stroke();
        }
    if (meshFrame) ctx.drawImage(this.meshes.canvas, 0, 0, WIDTH, HEIGHT);
    if (state.fruit)
      drawFruit(
        ctx,
        state.fruit.kind,
        (state.fruit.x + 0.5) * TILE,
        (state.fruit.y + 0.5) * TILE,
        26,
      );
    if (!meshFrame && (state.phase !== "dying" || state.phaseTime < 0.4)) {
      for (const ghost of state.ghosts)
        this.drawWrapped(ghost.x, ghost.y, (x, y) =>
          this.drawGhost(ghost, x, y, state, options.reducedMotion),
        );
    }
    if (!meshFrame)
      this.drawWrapped(state.pacman.x, state.pacman.y, (x, y) =>
        this.drawPacman(x, y, state, options.reducedMotion),
      );
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const popup of state.popups) {
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#03070f";
      ctx.fillStyle = "#aef7ff";
      const x = (popup.x + 0.5) * TILE,
        y = (popup.y + 0.5) * TILE;
      ctx.strokeText(popup.text, x, y);
      ctx.fillText(popup.text, x, y);
    }
    if (state.phase === "ready") {
      ctx.fillStyle = "#03070f";
      ctx.fillRect(10.7 * TILE, 16.8 * TILE, 6.6 * TILE, 1.4 * TILE);
      ctx.fillStyle = "#ffdc52";
      ctx.font = 'bold 21px "Courier New", monospace';
      ctx.fillText("READY!", WIDTH / 2, 17.5 * TILE);
    }
    // Slow GPUs keep real geometry while reducing only its raster size.
    // The flat maze and HUD remain sharp; simulation state is untouched.
    if (meshFrame && state.phase === "playing" && !state.paused) {
      this.meshCost += performance.now() - started;
      if (++this.meshSamples >= 45) {
        if (this.meshCost / this.meshSamples > 7.5 && this.meshScale > 0.5)
          this.meshScale = Math.max(0.5, this.meshScale * 0.8);
        this.meshSamples = 0;
        this.meshCost = 0;
      }
    }
  }

  private drawWrapped(
    x: number,
    y: number,
    draw: (x: number, y: number) => void,
  ): void {
    draw((x + 0.5) * TILE, (y + 0.5) * TILE);
    if (x < 0.5) draw((x + COLS + 0.5) * TILE, (y + 0.5) * TILE);
    if (x > COLS - 1.5) draw((x - COLS + 0.5) * TILE, (y + 0.5) * TILE);
  }

  private drawPacman(
    x: number,
    y: number,
    state: GameState,
    reducedMotion: boolean,
  ): void {
    const ctx = this.ctx;
    const angles = {
      right: 0,
      down: Math.PI / 2,
      left: Math.PI,
      up: -Math.PI / 2,
    };
    let mouth =
      reducedMotion || !state.pacman.moving
        ? 0.22
        : 0.08 + (Math.sin(state.time * 23) + 1) * 0.19;
    let rotation = angles[state.pacman.dir];
    let radius = 11;
    if (state.phase === "dying") {
      const progress = Math.min(1, Math.max(0, (state.phaseTime - 0.35) / 1.2));
      mouth = progress * Math.PI;
      rotation = -Math.PI / 2;
      if (progress > 0.97) radius = 0;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.55, 1.55);
    const surface = ctx.createRadialGradient(-3.8, -4.8, 0.6, 0, 0, 12);
    surface.addColorStop(0, "#fff4aa");
    surface.addColorStop(0.3, "#ffe95b");
    surface.addColorStop(0.72, "#ffd32b");
    surface.addColorStop(1, "#d98c0b");
    ctx.fillStyle = surface;
    ctx.shadowColor = "rgba(0, 0, 0, .7)";
    ctx.shadowBlur = reducedMotion ? 2 : 4;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, rotation + mouth, rotation + TAU - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private ghostBody(color: string, feet: boolean): HTMLCanvasElement {
    const key = `${color}:${feet}`;
    const cached = this.ghostBodies.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.translate(16, 16);
    ctx.beginPath();
    ctx.moveTo(-11, 10);
    ctx.lineTo(-11, -1);
    ctx.bezierCurveTo(-11, -15, 11, -15, 11, -1);
    ctx.lineTo(11, 10);
    if (feet) {
      ctx.lineTo(7.4, 7);
      ctx.lineTo(3.7, 10);
      ctx.lineTo(0, 7);
      ctx.lineTo(-3.7, 10);
      ctx.lineTo(-7.4, 7);
    } else {
      ctx.lineTo(7.4, 10);
      ctx.lineTo(5.5, 7);
      ctx.lineTo(2, 10);
      ctx.lineTo(-2, 10);
      ctx.lineTo(-5.5, 7);
      ctx.lineTo(-7.4, 10);
    }
    ctx.closePath();
    ctx.shadowColor = "rgba(0, 0, 0, .65)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    ctx.clip();
    const shade = ctx.createRadialGradient(-4, -6, 0, 1, 0, 17);
    shade.addColorStop(0, "rgba(255, 255, 255, .43)");
    shade.addColorStop(0.35, "rgba(255, 255, 255, .09)");
    shade.addColorStop(0.62, "rgba(0, 0, 0, .02)");
    shade.addColorStop(1, "rgba(0, 0, 0, .42)");
    ctx.fillStyle = shade;
    ctx.fillRect(-14, -15, 28, 30);
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 255, 255, .25)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-8.5, -5);
    ctx.quadraticCurveTo(-5, -11, 1, -9.7);
    ctx.stroke();
    this.ghostBodies.set(key, canvas);
    return canvas;
  }

  private drawGhost(
    ghost: Ghost,
    x: number,
    y: number,
    state: GameState,
    reducedMotion: boolean,
  ): void {
    const ctx = this.ctx;
    const frightened =
      ghost.mode === "frightened" ||
      (ghost.mode !== "eyes" && ghost.frightenedVisual === true);
    const config = getLevelConfig(state.level);
    // Fit the level's three or five white flashes into the final frightened span.
    const flashWindow = Math.min(
      config.frightenedSeconds,
      config.frightenedFlashes * 0.4,
    );
    const flashProgress =
      flashWindow > 0 ? 1 - state.frightenedRemaining / flashWindow : -1;
    const flash =
      frightened &&
      !reducedMotion &&
      flashProgress >= 0 &&
      Math.floor(flashProgress * config.frightenedFlashes * 2) % 2 === 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.5, 1.5);
    if (ghost.mode !== "eyes") {
      const feet = reducedMotion ? false : Math.floor(state.time * 9) % 2 === 0;
      const color = frightened
        ? flash
          ? "#f3eddf"
          : "#304ce3"
        : COLORS[ghost.id];
      ctx.drawImage(this.ghostBody(color, feet), -16, -16, 32, 32);
    }
    if (frightened) {
      ctx.fillStyle = flash ? "#ec3e50" : "#ffefc0";
      ctx.fillRect(-5, -3, 2.5, 3);
      ctx.fillRect(3, -3, 2.5, 3);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, 5);
      for (let i = 1; i < 7; i++) ctx.lineTo(-6 + i * 2, i % 2 ? 3 : 5);
      ctx.stroke();
    } else {
      const [dx, dy] = VECTORS[ghost.dir];
      for (const eye of [-4.8, 4.8]) {
        ctx.fillStyle = "#fffaf4";
        ctx.beginPath();
        ctx.ellipse(eye + dx, -2.2 + dy, 4.2, 5.1, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#153da6";
        ctx.beginPath();
        ctx.ellipse(eye + dx * 2.8, -2.2 + dy * 3, 2.1, 2.7, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

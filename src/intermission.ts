export const INTERMISSION_DURATION = 6;

const WIDTH = 672;
const HEIGHT = 744;
const TAU = Math.PI * 2;

function pacman(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  facing: -1 | 1,
  elapsed: number,
  still: boolean,
): void {
  const mouth = still ? 0.28 : 0.12 + (Math.sin(elapsed * 20) + 1) * 0.19;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.fillStyle = "#ffdf3d";
  ctx.shadowColor = "rgba(255, 223, 61, .16)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, radius, mouth, TAU - mouth);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function ghost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: -1 | 1,
  frightened: boolean,
  elapsed: number,
  still: boolean,
  stretched = false,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(stretched ? 1.3 : 1, stretched ? 0.85 : 1);
  ctx.fillStyle = frightened ? "#4263f0" : "#ff5265";
  ctx.beginPath();
  ctx.moveTo(-23, 23);
  ctx.lineTo(-23, -1);
  ctx.bezierCurveTo(-23, -30, 23, -30, 23, -1);
  ctx.lineTo(23, 23);
  const phase = still ? 0 : Math.floor(elapsed * 9) % 2;
  for (let i = 1; i < 7; i++)
    ctx.lineTo(23 - i * 7.67, (i + phase) % 2 ? 17 : 23);
  ctx.closePath();
  ctx.fill();
  if (frightened) {
    ctx.fillStyle = "#fff2c8";
    ctx.fillRect(-11, -6, 5, 6);
    ctx.fillRect(6, -6, 5, 6);
    ctx.strokeStyle = "#fff2c8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-13, 10);
    for (let i = 1; i <= 6; i++) ctx.lineTo(-13 + i * 4.3, i % 2 ? 6 : 10);
    ctx.stroke();
  } else {
    for (const eye of [-10, 10]) {
      ctx.fillStyle = "#fffaf4";
      ctx.beginPath();
      ctx.ellipse(eye + facing * 2, -5, 8, 10, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#173a9e";
      ctx.beginPath();
      ctx.ellipse(eye + facing * 6, -5, 4, 5, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A short original interpretation of the arcade chase intermissions. */
export function renderIntermission(
  canvas: HTMLCanvasElement,
  elapsed: number,
  level: number,
  reducedMotion: boolean,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#03070f";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(
    WIDTH / 2,
    355,
    12,
    WIDTH / 2,
    355,
    320,
  );
  glow.addColorStop(0, "#0c1c35");
  glow.addColorStop(1, "#03070f");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#8da2bb";
  ctx.font = '600 12px "Courier New", monospace';
  ctx.fillText("I N T E R M I S S I O N", WIDTH / 2, 166);
  ctx.fillStyle = "#f5f3e8";
  ctx.font = '600 30px "Courier New", monospace';
  ctx.fillText(
    `LEVEL ${String(level).padStart(2, "0")} COMPLETE`,
    WIDTH / 2,
    212,
  );
  ctx.strokeStyle = "#1c2c45";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(100, 270);
  ctx.lineTo(WIDTH - 100, 270);
  ctx.moveTo(100, 447);
  ctx.lineTo(WIDTH - 100, 447);
  ctx.stroke();

  const t = Math.max(0, Math.min(elapsed, INTERMISSION_DURATION));
  const variant = level >= 5 && level !== 9 && level !== 17;
  if (reducedMotion) {
    pacman(ctx, 258, 365, 47, 1, 0, true);
    ghost(ctx, 417, 365, 1, true, 0, true);
  } else if (!variant) {
    if (t < 2.7) {
      const x = WIDTH + 65 - t * 355;
      pacman(ctx, x, 365, 22, -1, t, false);
      ghost(ctx, x + 137, 365, -1, false, t, false);
    } else {
      const x = -150 + (t - 2.7) * 320;
      pacman(ctx, x, 350, 52, 1, t, false);
      ghost(ctx, x + 155, 365, 1, true, t, false);
    }
  } else {
    // The little floor snag is a visual nod to the original costume gag.
    ctx.strokeStyle = "#95b5d3";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(326, 391);
    ctx.lineTo(334, 381);
    ctx.lineTo(342, 391);
    ctx.stroke();
    if (t < 2.3) {
      const x = WIDTH + 25 - t * 255;
      pacman(ctx, x - 112, 365, 22, -1, t, false);
      ghost(ctx, Math.max(336, x), 365, -1, false, t, false, x < 350);
      if (x < 350) {
        ctx.strokeStyle = "#ff5265";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(334, 382);
        ctx.lineTo(365, 384);
        ctx.stroke();
      }
    } else if (t < 3.05) {
      ghost(ctx, 336, 365, 1, true, t, false, true);
      ctx.fillStyle = "#ffdf3d";
      ctx.font = 'bold 23px "Courier New", monospace';
      ctx.fillText("!", 336, 313);
    } else {
      const x = -130 + (t - 3.05) * 335;
      pacman(ctx, x, 350, 52, 1, t, false);
      ghost(ctx, 336 + (t - 3.05) * 160, 365, 1, true, t, false);
      ctx.fillStyle = "#ff5265";
      ctx.beginPath();
      ctx.moveTo(327, 390);
      ctx.lineTo(334, 383);
      ctx.lineTo(343, 392);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.fillStyle = "#a8b6c8";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText("The chase continues.", WIDTH / 2, 493);
  ctx.fillStyle = "#546c86";
  ctx.font = '11px "Courier New", monospace';
  ctx.fillText("BACK TO THE MAZE IN A MOMENT", WIDTH / 2, 523);
  // A quiet progress cue, without a countdown or flashing transition.
  ctx.fillStyle = "#18263a";
  ctx.fillRect(WIDTH / 2 - 54, 565, 108, 2);
  ctx.fillStyle = "#ffdf3d";
  ctx.fillRect(
    WIDTH / 2 - 54,
    565,
    108 * Math.min(1, t / INTERMISSION_DURATION),
    2,
  );
}

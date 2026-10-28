import "./style.css";
import { Game } from "./engine";
import { Renderer, drawFruit } from "./renderer";
import { ArcadeAudio } from "./audio";
import { isWalkable, key } from "./maze";
import { INTERMISSION_DURATION, renderIntermission } from "./intermission";
import { setupViewControls } from "./view";
import { guardedActivation } from "./activation";
import { ResumeCountdown, powerCue, queuedTurn } from "./experience";
import type { Direction, FruitKind, GameEvent, GameState } from "./types";
import { PACMAN_BRIDGE, PACMAN_MAX_TICKS, PacmanRankedSession, isBridgeEnvelope, type ChildMessage, type PacmanGraphics, type PacmanSettings } from "./pacman-host";

const embedded = window.parent !== window && new URLSearchParams(location.search).get("arcade") === "1";
if (embedded) document.body.classList.add("arcade-embedded");
let bridgeSession = 0;
let rankedConfig: { seed: number; maxTicks: number } | null = null;
let rankedSession: PacmanRankedSession | null = null;
let startingFromHost = false;
let bridgeFinished = false;
let bridgeSignature = "";
let bridgeGraphics: PacmanGraphics | null = null;
let disposed = false;
let frameRequest = 0;
const bridgeListeners = new AbortController();

function postToHost(message: ChildMessage) {
  if (embedded && !disposed) window.parent.postMessage({ channel: PACMAN_BRIDGE, ...message }, location.origin);
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing interface element: ${id}`);
  return node as T;
};
const storage = {
  get(name: string) {
    try {
      return localStorage.getItem(`afterhours.pacman.${name}`);
    } catch {
      return null;
    }
  },
  set(name: string, value: string) {
    try {
      localStorage.setItem(`afterhours.pacman.${name}`, value);
    } catch {
      /* Private browsing still supports play. */
    }
  },
};
let best = Math.max(0, Math.min(99999999, Number(storage.get("best")) || 0));
let sound = storage.get("sound") !== "off";
let reducedMotion =
  storage.get("motion") === "reduced" ||
  (storage.get("motion") === null &&
    matchMedia("(prefers-reduced-motion: reduce)").matches);
let playCues = storage.get("cues") !== "off";
let highContrast = storage.get("contrast") === "high";
const resumeCountdown = new ResumeCountdown();
let resumingGame: Game | null = null;
const tipCopy = {
  turns: "Choose your next turn early. The newest direction stays queued until a legal opening.",
  power: "Only blue, frightened ghosts are edible. Eyes return home; other ghosts can still catch you.",
  ghosts: "Four different pursuers: Blinky follows, Pinky aims ahead, Inky uses Blinky, Clyde retreats up close.",
} as const;
type Tip = keyof typeof tipCopy;
const seenTips = new Set((storage.get("tips-v1") ?? "").split(","));
let coachTip: Tip | null = null;
let coachWasVisible = false;
let powerWarned = [false, false];
let playerCount = 1;
let activePlayer = 0;
let games = [new Game({ highScore: best }), new Game({ highScore: best })];
let atTitle = true;
let lastTimestamp = 0;
let intermission: { elapsed: number; level: number } | null = null;
const shownIntermissions = new Set<string>();
const canvas = $<HTMLCanvasElement>("game-canvas");
const renderer = new Renderer(canvas);
const audio = new ArcadeAudio();
const help = $<HTMLDialogElement>("help-dialog");
const restartDialog = $<HTMLDialogElement>("restart-dialog");
let helpWasPaused = false;
let restartWasPaused = false;
let demo = new Game({ seed: 1980 });
let demoElapsed = 0;
let demoDecision = 0;
demo.start();

const game = () => games[activePlayer];
const padScore = (score: number) =>
  Math.floor(score).toString().padStart(6, "0");
const announce = (text: string) => {
  $("announcer").textContent = text;
};
const isOver = () =>
  !atTitle &&
  (rankedSession?.ended || games.slice(0, playerCount).every((g) => g.state.phase === "game-over"));
const modalOpen = () => help.open || restartDialog.open;
const viewControls = setupViewControls({
  resize: () => renderer.resize(),
  isModalOpen: modalOpen,
});
// Embedded cabinets use the host's fullscreen and a consistently fitted playfield.
// Preserve the standalone cabinet-view preference while setting this document's view.
if (embedded && !document.body.classList.contains("theater-view")) {
  let previousView: string | null = null;
  try { previousView = localStorage.getItem("afterhours.pacman.view"); } catch { /* Optional persistence. */ }
  $("view-button").click();
  try {
    if (previousView === null) localStorage.removeItem("afterhours.pacman.view");
    else localStorage.setItem("afterhours.pacman.view", previousView);
  } catch { /* Optional persistence. */ }
}

function setPlayerCount(count: number) {
  if (rankedConfig && count !== 1) return;
  playerCount = count;
  for (const [id, chosen] of [
    ["one-player", count === 1],
    ["two-players", count === 2],
  ] as const) {
    $(id).classList.toggle("selected", chosen);
    $(id).setAttribute("aria-pressed", String(chosen));
  }
  updateInterface();
}

function startGame() {
  if (embedded && rankedConfig && !startingFromHost) {
    postToHost({ type: "restart", session: bridgeSession });
    return;
  }
  cancelResume();
  finishTip();
  coachTip = seenTips.has("turns") ? null : "turns";
  powerWarned = [false, false];
  rankedSession = rankedConfig ? new PacmanRankedSession(rankedConfig.seed, rankedConfig.maxTicks, best) : null;
  games = [rankedSession?.game ?? new Game({ highScore: best }), new Game({ highScore: best })];
  bridgeFinished = false;
  bridgeSignature = "";
  activePlayer = 0;
  atTitle = false;
  intermission = null;
  shownIntermissions.clear();
  game().start();
  audio.setEnabled(sound);
  void audio.unlock();
  audio.handle(game().drainEvents());
  lastTimestamp = 0;
  announce(
    `${playerCount === 2 ? "Two player game. Player 1" : "Game started"}. Three lives. Ready.`,
  );
  updateInterface();
  $<HTMLButtonElement>("pause-button").focus({ preventScroll: true });
}

function returnToTitle() {
  cancelResume();
  finishTip();
  atTitle = true;
  if (embedded && rankedConfig) postToHost({ type: "menu", session: bridgeSession });
  rankedConfig = null;
  rankedSession = null;
  intermission = null;
  games = [new Game({ highScore: best }), new Game({ highScore: best })];
  activePlayer = 0;
  audio.update(game().state);
  updateInterface();
  $("start-button").focus({ preventScroll: true });
}

function cancelResume() {
  resumeCountdown.cancel();
  resumingGame = null;
  rankedSession?.resetClock();
}

function finishTip() {
  if (coachTip && coachWasVisible) {
    seenTips.add(coachTip);
    storage.set("tips-v1", [...seenTips].join(","));
  }
  coachTip = null;
  coachWasVisible = false;
}

function beginResume() {
  if (!game().state.paused) return;
  // Ready/level transitions already have their own original timing.
  if (game().state.phase === "playing" && !intermission) {
    resumingGame = game();
    resumeCountdown.start();
    announce("Get ready. Resuming in three seconds. You can queue a turn now.");
    requestAnimationFrame(() => {
      if (resumeCountdown.active && !modalOpen())
        $("cancel-resume").focus({ preventScroll: true });
    });
  } else {
    game().togglePause();
    announce("Game resumed.");
  }
  lastTimestamp = 0;
  void audio.unlock();
}

function togglePause() {
  if (atTitle || isOver() || modalOpen()) return;
  if (resumeCountdown.active) {
    cancelResume();
    announce("Countdown cancelled. Game paused.");
  } else if (game().state.paused) beginResume();
  else {
    game().togglePause();
    announce("Game paused.");
  }
  lastTimestamp = 0;
  rankedSession?.resetClock();
  audio.update(game().state);
  updateInterface();
  if (resumeCountdown.active) $("cancel-resume").focus({ preventScroll: true });
  else if (game().state.paused) $("resume-button").focus({ preventScroll: true });
  else $("pause-button").focus({ preventScroll: true });
}

function keepPaused() {
  if (atTitle || isOver() || modalOpen()) return;
  cancelResume();
  if (!game().state.paused) game().togglePause();
  lastTimestamp = 0;
  rankedSession?.resetClock();
  audio.update(game().state);
  announce("Game remains paused. Resume when ready.");
  updateInterface();
  $("resume-button").focus({ preventScroll: true });
}

function pauseForBackground() {
  const wasCounting = resumeCountdown.active;
  cancelResume();
  if (!atTitle && !isOver() && !game().state.paused) {
    game().togglePause();
    audio.update(game().state);
    announce("Game paused while you were away. Resume when ready.");
    updateInterface();
  }
  if (wasCounting) {
    announce("Countdown cancelled while you were away. Resume when ready.");
    updateInterface();
  }
  lastTimestamp = 0;
  rankedSession?.resetClock();
}

function move(direction: Direction) {
  if (atTitle || isOver() ||
      (game().state.paused && !resumeCountdown.active) || modalOpen()) return;
  if (rankedSession) rankedSession.input(direction);
  else game().input(direction);
}

function toggleSound() {
  setSound(!sound);
}

function setSound(enabled: boolean) {
  sound = enabled;
  storage.set("sound", sound ? "on" : "off");
  audio.setEnabled(sound && !atTitle);
  updateSettings();
}

function setMotion(reduced: boolean) {
  reducedMotion = reduced;
  storage.set("motion", reduced ? "reduced" : "full");
  updateSettings();
}

function setContrast(high: boolean) {
  highContrast = high;
  storage.set("contrast", high ? "high" : "normal");
  updateSettings();
}

function updateSettings() {
  $("sound-label").textContent = sound ? "Sound on" : "Sound off";
  $("sound-icon").textContent = sound ? "♫" : "♪";
  $("sound-button").setAttribute("aria-pressed", String(sound));
  $("sound-button").setAttribute(
    "aria-label",
    sound ? "Mute sound" : "Enable sound",
  );
  $<HTMLInputElement>("motion-toggle").checked = reducedMotion;
  $<HTMLInputElement>("dialog-motion-toggle").checked = reducedMotion;
  document.body.classList.toggle("reduced-motion", reducedMotion);
  $<HTMLInputElement>("cues-toggle").checked = playCues;
  $<HTMLInputElement>("contrast-toggle").checked = highContrast;
  document.body.classList.toggle("high-contrast", highContrast);
  updateInterface();
}

function openHelp() {
  helpWasPaused = game().state.paused && !resumeCountdown.active;
  cancelResume();
  if (!atTitle && !isOver() && !game().state.paused) game().togglePause();
  audio.update(game().state);
  help.showModal();
  updateInterface();
}
function closeHelp() {
  help.close();
  if (!atTitle && !isOver() && !helpWasPaused && game().state.paused)
    beginResume();
  lastTimestamp = 0;
  updateInterface();
}
function requestRestart() {
  if (atTitle || isOver()) return;
  restartWasPaused = game().state.paused && !resumeCountdown.active;
  cancelResume();
  if (!game().state.paused) game().togglePause();
  audio.update(game().state);
  restartDialog.showModal();
  updateInterface();
}
function cancelRestart() {
  restartDialog.close();
  if (!restartWasPaused && game().state.paused) beginResume();
  lastTimestamp = 0;
  updateInterface();
}

let lastLifeSignature = "";
let lastFruitSignature = "";
let lastInterfaceSignature = "";
function updateInterface() {
  const state = game().state;
  const over = isOver();
  const power = playCues && !atTitle && !over ? powerCue(state) : null;
  const turn = playCues && !atTitle && !over ? queuedTurn(state) : null;
  const canCoach = playCues && !atTitle && !over && !modalOpen() &&
    !intermission && !resumeCountdown.active && (state.phase === "ready" || state.paused);
  if (!canCoach && coachWasVisible) finishTip();
  const showCoach = canCoach && coachTip !== null;
  if (showCoach) coachWasVisible = true;
  const signature = [
    atTitle,
    activePlayer,
    playerCount,
    state.phase,
    state.paused,
    state.score,
    best,
    state.level,
    state.lives,
    state.remaining,
    games[0].state.score,
    games[1].state.score,
    !!intermission,
    renderer.graphicsInfo.backend,
    modalOpen(),
    resumeCountdown.seconds,
    power?.seconds, power?.ending, power?.edibleCount,
    power ? Math.round(power.progress * 50) : 0,
    turn?.direction, playCues, highContrast, showCoach, coachTip,
  ].join("|");
  if (signature === lastInterfaceSignature) return;
  lastInterfaceSignature = signature;
  $("score").textContent = padScore(games[0].state.score);
  $("score-p2").textContent = padScore(games[1].state.score);
  $("high-score").textContent = padScore(best);
  const hasMeshes = renderer.graphicsInfo.backend === "webgl";
  $("graphics-status").textContent = hasMeshes ? "3D" : "2D fallback";
  $("graphics-status").title = hasMeshes
    ? "3D mesh characters and pellets"
    : "3D graphics unavailable; 2D fallback is active";
  $("graphics-status").setAttribute(
    "aria-label",
    hasMeshes ? "3D mesh graphics active" : "2D fallback graphics active",
  );
  $("level").textContent = String(state.level).padStart(2, "0");
  $("p1-cell").classList.toggle("active", activePlayer === 0);
  $("p2-cell").classList.toggle("active", activePlayer === 1);
  $("p2-cell").hidden = playerCount === 1;
  $("level-cell").hidden = playerCount === 2;
  $("title-overlay").hidden = !atTitle;
  $("pause-overlay").hidden = atTitle || over || !state.paused || modalOpen() || resumeCountdown.active;
  $("resume-countdown").hidden = !resumeCountdown.active || modalOpen();
  $("resume-number").textContent = String(resumeCountdown.seconds);
  $("coach-hint").hidden = !showCoach;
  if (coachTip) $("coach-copy").textContent = tipCopy[coachTip];
  $("gameover-overlay").hidden = !over || embedded;
  $("player-callout").hidden =
    atTitle || over || state.phase !== "ready" || state.paused;
  $("player-callout").textContent =
    `PLAYER ${activePlayer + 1}${playerCount === 2 ? ` · LEVEL ${String(state.level).padStart(2, "0")}` : ""}`;
  $("pause-label").textContent = resumeCountdown.active ? "Keep paused" : state.paused ? "Resume" : "Pause";
  $<HTMLButtonElement>("pause-button").disabled = atTitle || over;
  $<HTMLButtonElement>("restart-button").disabled = atTitle || over;
  $("pause-button").setAttribute(
    "aria-label",
    resumeCountdown.active ? "Cancel resume countdown" : state.paused ? "Resume game" : "Pause game",
  );
  const status = atTitle
    ? "READY WHEN YOU ARE"
    : over
      ? "THANKS FOR PLAYING"
      : resumeCountdown.active
        ? `RESUMING IN ${resumeCountdown.seconds}`
      : state.paused
        ? "ON YOUR TIME"
        : intermission
          ? "THE CHASE CONTINUES"
          : state.phase === "ready"
            ? `LEVEL ${String(state.level).padStart(2, "0")} · GET READY`
            : power ? power.text : `${state.remaining} DOTS TO GO`;
  $("board-status").textContent = status;
  $("board-status").title = power?.label ?? status;
  $("board-status").setAttribute("aria-label", power?.label ?? status);
  $("board-status").dataset.ending = String(power?.ending ?? false);
  $("input-cue").hidden = !turn;
  if (turn) {
    $("input-cue").textContent = `NEXT ${turn.arrow}`;
    $("input-cue").title = turn.label;
    $("input-cue").setAttribute("aria-label", turn.label);
  }
  $("power-meter").hidden = !power;
  if (power) {
    $("power-meter").style.setProperty("--power-progress", String(power.progress));
    $("power-meter").dataset.ending = String(power.ending);
  }
  const livesSignature = String(state.lives);
  if (livesSignature !== lastLifeSignature) {
    lastLifeSignature = livesSignature;
    $("lives").replaceChildren(
      ...Array.from({ length: Math.min(6, state.lives) }, () => {
        const icon = document.createElement("span");
        icon.className = "life-icon";
        icon.setAttribute("aria-hidden", "true");
        return icon;
      }),
    );
    $("lives").setAttribute("aria-label", `${state.lives} lives remaining`);
  }
  const fruitSignature = state.fruitHistory.join(",");
  if (fruitSignature !== lastFruitSignature) {
    lastFruitSignature = fruitSignature;
    $("fruit-history").replaceChildren(
      ...state.fruitHistory.slice(-7).map(fruitIcon),
    );
  }
  if (over) {
    const max = Math.max(
      ...games.slice(0, playerCount).map((g) => g.state.score),
    );
    $("result-score").textContent = padScore(max);
    $("result-eyebrow").textContent =
      max >= best && max > 0 ? "YOUR PERSONAL BEST" : "A GOOD RUN";
    $("result-copy").textContent =
      playerCount === 1
        ? "There’s always one more round."
        : games[0].state.score === games[1].state.score
          ? "A perfect tie. Settle it in the maze."
          : `Player ${games[0].state.score > games[1].state.score ? "1" : "2"} takes the high score.`;
  }
}

function fruitIcon(kind: FruitKind) {
  const icon = document.createElement("canvas");
  icon.width = 48;
  icon.height = 48;
  icon.style.width = "16px";
  icon.style.height = "16px";
  icon.title = kind;
  icon.setAttribute("aria-label", kind);
  icon.setAttribute("role", "img");
  const ctx = icon.getContext("2d");
  if (ctx) drawFruit(ctx, kind, 24, 24, 36);
  return icon;
}

function handleEvents(events: GameEvent[]) {
  audio.handle(events);
  for (const event of events) {
    if (event.type === "energizer") {
      powerWarned[activePlayer] = false;
      if (!seenTips.has("power")) coachTip = "power";
    }
    if (event.type === "extra-life")
      announce("Ten thousand points. Extra life!");
    if (event.type === "death") {
      announce(`Player ${activePlayer + 1} lost a life.`);
      if (!seenTips.has("ghosts")) coachTip = "ghosts";
    }
    if (event.type === "level")
      announce(`Maze complete. Level ${game().state.level + 1} coming up.`);
    if (event.type === "fruit")
      announce(`Bonus fruit. ${event.value ?? ""} points.`);
    if (event.type === "game-over" && isOver()) {
      announce(`Game over. Score ${game().state.score}.`);
      requestAnimationFrame(() =>
        $("again-button").focus({ preventScroll: true }),
      );
    }
  }
}

function switchPlayerIfNeeded(previousPhase: GameState["phase"]) {
  if (
    playerCount !== 2 ||
    previousPhase !== "dying" ||
    !["ready", "game-over"].includes(game().state.phase)
  )
    return;
  const next = 1 - activePlayer;
  if (games[next].state.phase === "game-over") return;
  activePlayer = next;
  if (game().state.phase === "title") game().start();
  handleEvents(game().drainEvents());
  announce(
    `Player ${activePlayer + 1}. Your turn. Level ${game().state.level}.`,
  );
}

const vectors: Record<Direction, [number, number]> = {
  up: [0, -1],
  left: [-1, 0],
  down: [0, 1],
  right: [1, 0],
};
const opposite: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
function driveDemo() {
  const s = demo.state;
  const sx = Math.round(s.pacman.x),
    sy = Math.round(s.pacman.y);
  const blocked = new Set<number>();
  for (const ghost of s.ghosts)
    if (ghost.mode === "normal") {
      const gx = Math.round(ghost.x),
        gy = Math.round(ghost.y);
      blocked.add(key(gx, gy));
      for (const [dx, dy] of Object.values(vectors))
        blocked.add(key(gx + dx, gy + dy));
    }
  const queue: { x: number; y: number; first: Direction | null }[] = [
    { x: sx, y: sy, first: null },
  ];
  const seen = new Set<number>([key(sx, sy)]);
  for (let i = 0; i < queue.length && i < 500; i++) {
    const current = queue[i];
    if (
      current.first &&
      (s.pellets.has(key(current.x, current.y)) ||
        s.energizers.has(key(current.x, current.y)))
    ) {
      demo.input(current.first);
      return;
    }
    for (const direction of Object.keys(vectors) as Direction[]) {
      if (i === 0 && direction === opposite[s.pacman.dir]) continue;
      const [dx, dy] = vectors[direction];
      const x = (current.x + dx + 28) % 28,
        y = current.y + dy,
        tile = key(x, y);
      if (!seen.has(tile) && !blocked.has(tile) && isWalkable(x, y, "pacman")) {
        seen.add(tile);
        queue.push({ x, y, first: current.first ?? direction });
      }
    }
  }
  demo.input(opposite[s.pacman.dir]);
}

function frame(timestamp: number) {
  if (disposed) return;
  const delta = lastTimestamp
    ? Math.min((timestamp - lastTimestamp) / 1000, 0.1)
    : 0;
  lastTimestamp = timestamp;
  let resumedThisFrame = false;
  if (resumeCountdown.active) {
    if (document.hidden || modalOpen() || atTitle || resumingGame !== game()) cancelResume();
    else if (resumeCountdown.advance(delta)) {
      resumingGame = null;
      if (game().state.paused) game().togglePause();
      resumedThisFrame = true;
      announce("Game resumed.");
      $("pause-button").focus({ preventScroll: true });
    }
  }
  if (atTitle) {
    if (!reducedMotion && !document.hidden && !modalOpen()) {
      demoElapsed += delta;
      demoDecision += delta;
      if (demoDecision > 0.075) {
        driveDemo();
        demoDecision = 0;
      }
      demo.update(delta);
      demo.drainEvents();
      if (demo.state.phase === "game-over" || demoElapsed > 95) {
        demo = new Game({ seed: 1980 });
        demo.start();
        demoElapsed = 0;
      }
    }
    renderer.render(demo.state, { reducedMotion, highContrast });
  } else {
    if (intermission) {
      if (!game().state.paused && !document.hidden)
        intermission.elapsed += delta;
      renderIntermission(
        canvas,
        intermission.elapsed,
        intermission.level,
        reducedMotion,
      );
      if (intermission.elapsed >= INTERMISSION_DURATION) intermission = null;
    } else {
      const previous = game().state.phase;
      if (!document.hidden) {
        if (rankedSession) rankedSession.advance(resumedThisFrame ? 0 : delta);
        else game().update(resumedThisFrame ? 0 : delta);
      }
      handleEvents(game().drainEvents());
      switchPlayerIfNeeded(previous);
      const s = game().state;
      if (s.score > best) {
        best = s.score;
        storage.set("best", String(best));
      }
      const intermissionKey = `${activePlayer}:${s.level}`;
      if (
        s.phase === "level-clear" &&
        s.phaseTime >= 1.4 &&
        [2, 5, 9, 13, 17].includes(s.level) &&
        !shownIntermissions.has(intermissionKey)
      ) {
        shownIntermissions.add(intermissionKey);
        intermission = { elapsed: 0, level: s.level };
      }
      const power = powerCue(s);
      if (playCues && !s.paused && power?.ending && power.edibleCount > 0 && !powerWarned[activePlayer]) {
        powerWarned[activePlayer] = true;
        announce("Blue ghosts are about to turn dangerous. Other ghosts can still catch you.");
      }
      renderer.render(s, { reducedMotion, highContrast });
    }
  }
  audio.update(game().state);
  updateInterface();
  publishBridge();
  frameRequest = requestAnimationFrame(frame);
}

$("start-button").addEventListener("click", startGame);
$("again-button").addEventListener("click", startGame);
$("menu-button").addEventListener("click", returnToTitle);
$("one-player").addEventListener("click", () => setPlayerCount(1));
$("two-players").addEventListener("click", () => setPlayerCount(2));
$("pause-button").addEventListener("click", togglePause);
guardedActivation($("resume-button"), togglePause);
$("cancel-resume").addEventListener("click", keepPaused);
$("cancel-resume").addEventListener("pointerup", event => {
  // Some mobile browsers omit/delay the compatibility click after a swipe.
  // Cancellation is immediate and idempotent, including a later click.
  if (event.pointerType === "touch" || event.pointerType === "pen") {
    event.preventDefault();
    keepPaused();
  }
});
$("coach-dismiss").addEventListener("click", () => {
  finishTip();
  updateInterface();
});
$("restart-button").addEventListener("click", requestRestart);
$("confirm-restart").addEventListener("click", () => {
  restartDialog.close();
  startGame();
});
$("cancel-restart").addEventListener("click", cancelRestart);
restartDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelRestart();
});
$("sound-button").addEventListener("click", toggleSound);
$("help-button").addEventListener("click", openHelp);
$("rules-link").addEventListener("click", openHelp);
$("close-help").addEventListener("click", closeHelp);
$("help-done").addEventListener("click", closeHelp);
help.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeHelp();
});
for (const id of ["motion-toggle", "dialog-motion-toggle"])
  $(id).addEventListener("change", (event) =>
    setMotion((event.target as HTMLInputElement).checked),
  );
$("cues-toggle").addEventListener("change", (event) => {
  playCues = (event.target as HTMLInputElement).checked;
  storage.set("cues", playCues ? "on" : "off");
  updateSettings();
});
$("contrast-toggle").addEventListener("change", (event) => {
  setContrast((event.target as HTMLInputElement).checked);
});

const keyDirections: Record<string, Direction> = {
  arrowup: "up",
  w: "up",
  arrowleft: "left",
  a: "left",
  arrowdown: "down",
  s: "down",
  arrowright: "right",
  d: "right",
};
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || modalOpen()) return;
  const keyName = event.key.toLowerCase();
  if (embedded && (keyName === "f" || keyName === "v")) {
    event.preventDefault();
    if (keyName === "f" && !event.repeat) postToHost({ type: "fullscreen", session: bridgeSession });
    return;
  }
  if (!embedded && viewControls.handleKey(event)) return;
  if (keyDirections[keyName]) {
    event.preventDefault();
    move(keyDirections[keyName]);
  } else if ((keyName === "p" || keyName === "escape") && !event.repeat) {
    event.preventDefault();
    togglePause();
  } else if (keyName === "m" && !event.repeat) {
    event.preventDefault();
    toggleSound();
  } else if (
    keyName === "enter" &&
    !event.repeat &&
    (atTitle || isOver()) &&
    !(event.target instanceof HTMLButtonElement)
  ) {
    event.preventDefault();
    startGame();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseForBackground();
  else lastTimestamp = 0;
});
window.addEventListener("blur", pauseForBackground);

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-direction]",
)) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add("held");
    move(button.dataset.direction as Direction);
  });
  const release = () => button.classList.remove("held");
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("click", (event) => {
    if (event.detail === 0) move(button.dataset.direction as Direction);
  });
}
function installSwipe(surface: HTMLElement) {
  let swipe: { x: number; y: number; id: number } | null = null;
  surface.addEventListener("pointerdown", (event) => {
    if (atTitle || isOver() || !event.isPrimary || event.button !== 0 ||
        (game().state.paused && !resumeCountdown.active) ||
        (event.target instanceof Element && event.target.closest("button, input, a"))) return;
    event.preventDefault();
    swipe = { x: event.clientX, y: event.clientY, id: event.pointerId };
    surface.setPointerCapture(event.pointerId);
  });
  surface.addEventListener("pointermove", (event) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x,
      dy = event.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
    move(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? "right" : "left"
        : dy > 0 ? "down" : "up",
    );
    swipe.x = event.clientX;
    swipe.y = event.clientY;
  });
  const release = (event: PointerEvent) => {
    if (swipe?.id === event.pointerId) swipe = null;
  };
  surface.addEventListener("pointerup", release);
  surface.addEventListener("pointercancel", release);
  surface.addEventListener("lostpointercapture", release);
}
installSwipe(canvas);
installSwipe($("resume-countdown"));
window.addEventListener("resize", () => renderer.resize());

// Development-only inspection surface for repeatable browser checks. Vite removes this in production.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __PACMAN__: {
      get game() {
        return game();
      },
      get games() {
        return games;
      },
      get activePlayer() {
        return activePlayer;
      },
      get playerCount() {
        return playerCount;
      },
      get atTitle() {
        return atTitle;
      },
      get intermission() {
        return intermission;
      },
      startGame,
      setPlayerCount,
      pause: pauseForBackground,
      get audio() {
        return audio;
      },
      get renderer() {
        return renderer;
      },
      get resumeCountdown() {
        return resumeCountdown;
      },
      get rankedSession() {
        return rankedSession;
      },
    },
  });
}
updateSettings();
updateInterface();
frameRequest = requestAnimationFrame(frame);

function publishReady() {
  bridgeGraphics = renderer.graphicsInfo.backend === "webgl" ? "webgl" : "canvas-fallback";
  postToHost({ type: "ready", graphics: bridgeGraphics });
}

function publishBridge(force = false) {
  if (!embedded || disposed) return;
  const graphics = renderer.graphicsInfo.backend === "webgl" ? "webgl" : "canvas-fallback";
  if (graphics !== bridgeGraphics) publishReady();
  if (bridgeSession === 0) return;
  const state = game().state;
  const phase = atTitle ? "intro" : isOver() ? "ended" : resumeCountdown.active ? "countdown" : state.paused || modalOpen() ? "paused" : "playing";
  const signature = [phase, Math.floor(state.frame / 15), state.score, state.lives, state.level, state.remaining, resumeCountdown.seconds, graphics].join(":");
  if (force || signature !== bridgeSignature) {
    bridgeSignature = signature;
    postToHost({ type: "status", session: bridgeSession, phase, graphics, countdown: resumeCountdown.active ? resumeCountdown.seconds : undefined,
      hud: { score: state.score, level: state.level, lives: state.lives, remaining: state.remaining, frames: state.frame, paused: phase !== "playing", phase: state.phase } });
  }
  if (!bridgeFinished && isOver()) {
    const result = rankedSession?.finish() ?? { score: Math.max(...games.slice(0, playerCount).map(g => g.state.score)),
      frames: games.slice(0, playerCount).reduce((sum, g) => sum + g.state.frame, 0), inputs: [], victory: false };
    bridgeFinished = true;
    if (!state.paused && state.phase !== "game-over") game().togglePause();
    rankedSession?.resetClock();
    audio.update(state);
    postToHost({ type: "finished", session: bridgeSession, result });
  }
}

function applyHostSettings(settings: PacmanSettings) {
  setSound(!settings.muted);
  setMotion(settings.reducedMotion);
  setContrast(settings.highContrast);
}

function disposeBridge() {
  if (disposed) return;
  pauseForBackground();
  disposed = true;
  cancelAnimationFrame(frameRequest);
  window.removeEventListener("message", receiveHost);
  window.removeEventListener("pagehide", disposeBridge);
  bridgeListeners.abort();
  audio.destroy();
}

function receiveHost(event: MessageEvent) {
  if (!embedded || disposed || event.origin !== location.origin || event.source !== window.parent || !isBridgeEnvelope(event.data)) return;
  const message = event.data;
  if (message.type === "hello") publishReady();
  else if (message.type === "dispose") disposeBridge();
  else if (message.type === "pause") pauseForBackground();
  else if (message.type === "toggle-pause") togglePause();
  else if (message.type === "help") { if (!help.open) openHelp(); }
  else if (message.type === "settings" && message.settings && typeof message.settings === "object") {
    const settings = message.settings as Record<string, unknown>;
    if ([settings.muted, settings.reducedMotion, settings.highContrast].every(value => typeof value === "boolean")) applyHostSettings(settings as unknown as PacmanSettings);
  } else if (message.type === "start" && Number.isSafeInteger(message.session) && (message.session as number) > bridgeSession && (message.mode === "ranked" || message.mode === "practice")) {
    if (message.mode === "ranked" && (!Number.isInteger(message.seed) || (message.seed as number) < 0 || (message.seed as number) > 0xffffffff ||
      !Number.isInteger(message.maxTicks) || (message.maxTicks as number) < 1 || (message.maxTicks as number) > PACMAN_MAX_TICKS)) return;
    const keepHelpOpen = help.open && message.paused === true;
    help.close();
    restartDialog.close();
    bridgeSession = message.session as number;
    bridgeFinished = false;
    bridgeSignature = "";
    rankedConfig = message.mode === "ranked" ? { seed: message.seed as number, maxTicks: message.maxTicks as number } : null;
    const twoPlayers = $<HTMLButtonElement>("two-players");
    twoPlayers.disabled = !!rankedConfig;
    twoPlayers.textContent = rankedConfig ? "1 PLAYER · GLOBAL" : "2 PLAYERS";
    twoPlayers.title = rankedConfig ? "Global challenges use one player and a two-minute limit. Classic local play supports two players." : "Two players alternate after each life.";
    if (rankedConfig) {
      setPlayerCount(1);
      startingFromHost = true;
      try { startGame(); } finally { startingFromHost = false; }
    } else returnToTitle();
    if (message.paused === true) pauseForBackground();
    if (keepHelpOpen) openHelp();
    publishBridge(true);
  }
  publishBridge(true);
}

if (embedded) {
  window.addEventListener("message", receiveHost, { signal: bridgeListeners.signal });
  window.addEventListener("pagehide", disposeBridge, { signal: bridgeListeners.signal });
  // PostMessage cannot carry transient audio activation. A real tap/key in the child unlocks audio.
  window.addEventListener("pointerdown", () => { if (!disposed && !atTitle) void audio.unlock(); }, { capture: true, signal: bridgeListeners.signal });
  window.addEventListener("keydown", () => { if (!disposed && !atTitle) void audio.unlock(); }, { capture: true, signal: bridgeListeners.signal });
  $("fullscreen-button").addEventListener("click", event => {
    event.preventDefault(); event.stopImmediatePropagation();
    postToHost({ type: "fullscreen", session: bridgeSession });
  }, { capture: true, signal: bridgeListeners.signal });
  publishReady();
}

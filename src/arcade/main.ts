import "./style.css";
import { guardedActivation } from "../activation";
import { cabinets } from "./catalog";
import { ArcadeController, type FinishedRun } from "./controller";
import { ArcadeSound } from "./audio";
import { Leaderboard } from "./leaderboard";
import { supportsWebGL2 } from "./capabilities";
import { Showroom } from "./showroom";
import { PacmanAdapter } from "./pacman-adapter";
import { ApiError, submitRun } from "./api";
import { localBest, preference, saveBest, store } from "./preferences";
import { MAX_TICKS, TICK_RATE, type ArcadeSimulation, type GameDefinition, type GameId, type NewGameId } from "./shared/contracts";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const value = document.getElementById(id); if (!value) throw new Error(`Missing arcade interface: ${id}`); return value as T;
};
const webgl2Available = supportsWebGL2();
if (!webgl2Available) {
  document.body.classList.add("webgl2-unavailable");
  $("graphics-capability").hidden = false;
  $("graphics-capability").textContent = "WebGL 2 is unavailable in this browser. PAC-MAN can use its 2D fallback; the other nine cabinets require WebGL 2. You can still browse every global leaderboard.";
  for (const card of document.querySelectorAll<HTMLElement>('[data-game]:not([data-game="pacman"])')) {
    card.setAttribute("aria-describedby", "graphics-capability");
    const badge = document.createElement("span"); badge.className = "cabinet-capability";
    badge.textContent = "Needs WebGL 2"; card.append(badge);
  }
}
const audio = new ArcadeSound();
const board = new Leaderboard();
let selected: GameId | null = null;
let controller: ArcadeController | null = null;
let pacman: PacmanAdapter | null = null;
let showroom: Showroom | null = null;
let revision = 0;
let result: FinishedRun | null = null;
let resultAccepted = false;
let submitting = false;
let noticeTimer = 0;
let pendingSwitch: (() => void) | null = null;
let resumeAfterSwitch = false;
let resumeAfterModal = false;
let lastFullscreenExit = -Infinity;
let wasFullscreen = false;
let hudSignature = "";
const dialogs = {
  settings: $<HTMLDialogElement>("settings-dialog"),
  instructions: $<HTMLDialogElement>("instructions-dialog"),
  scores: $<HTMLDialogElement>("score-dialog"),
  switch: $<HTMLDialogElement>("switch-dialog"),
};
const active = () => controller ?? pacman;
const modalOpen = () => Object.values(dialogs).some(dialog => dialog.open);
const announce = (message: string) => { $("arcade-announcer").textContent = message; };
function notice(message: string) {
  clearTimeout(noticeTimer); $("arcade-notice").textContent = message; $("arcade-notice").hidden = false;
  noticeTimer = window.setTimeout(() => { $("arcade-notice").hidden = true; }, 7500);
}
function updateBests() {
  for (const node of document.querySelectorAll<HTMLElement>("[data-best]")) {
    const best = localBest(node.dataset.best!);
    node.textContent = best > 0 ? best.toLocaleString() : "—";
  }
}
function showOverlay(phase: string, title: string, copy: string, countdown = 0) {
  const overlay = $("play-overlay");
  // Embedded Pac-Man retains its own tested title/pause/countdown surfaces.
  const childOwns = selected === "pacman" && ["playing", "paused", "countdown", "ready"].includes(phase);
  overlay.hidden = phase === "playing" || childOwns;
  $("overlay-kicker").textContent = phase === "countdown" ? "BACK TO THE NIGHT" : phase === "paused" ? "ON YOUR TIME" : phase === "ended" ? "ONE MORE ROUND?" : "AFTER HOURS · FREE PLAY";
  $("overlay-title").textContent = title; $("overlay-copy").textContent = copy;
  $("countdown-number").hidden = phase !== "countdown";
  $("countdown-number").textContent = String(countdown);
  $("play-start-button").hidden = !["intro", "ended"].includes(phase);
  $("play-practice-button").hidden = !["intro", "ended", "unavailable"].includes(phase);
  $("play-practice-button").textContent = phase === "unavailable" ? "Try Pac-Man" : selected === "pacman" ? "Classic local play" : "Local practice";
  $("play-resume-button").hidden = phase !== "paused";
  $("play-keep-paused").hidden = phase !== "countdown";
  $<HTMLButtonElement>("play-pause-button").disabled = !["playing", "paused", "countdown", "ready"].includes(phase);
  $("play-pause-button").setAttribute("aria-label", phase === "paused" ? "Resume game" : phase === "countdown" ? "Cancel resume countdown" : "Pause game");
  $("play-pause-button").setAttribute("aria-pressed", String(phase !== "playing"));
  $("play-pause-button").title = phase === "paused" ? "Resume (P)" : phase === "countdown" ? "Keep paused (P)" : "Pause (P)";
  $("play-pause-button").querySelector("path")?.setAttribute("d", phase === "paused" ? "M6 3 17 10 6 17z" : "M5 4h3v12H5zM12 4h3v12h-3z");
  const label = $("play-pause-button").querySelector(".button-label");
  if (label) label.textContent = phase === "paused" ? "Resume" : phase === "countdown" ? "Keep paused" : "Pause";
  if (phase === "countdown") announce(`Resuming in ${countdown}. Choose your direction.`);
  updateMode();
  if (["intro", "paused"].includes(phase) && !childOwns)
    requestAnimationFrame(() => { if (!modalOpen()) $(phase === "intro" ? "play-start-button" : "play-resume-button").focus({ preventScroll: true }); });
}
function updateMode() {
  const game = active();
  const savingCopy = !game || ["intro", "loading", "preparing"].includes(game.phase)
    ? "Ranked: post to the global board after your run. Practice: local best only."
    : game.ranked ? "Global score not posted yet · finish, enter initials and save."
    : "Practice · local best on this device · no global submission.";
  if (game?.phase !== "ended" && $("score-save-status").textContent !== savingCopy) $("score-save-status").textContent = savingCopy;
  $("play-mode").textContent = !game || ["intro", "loading"].includes(game.phase) ? "FREE PLAY · CHOOSE YOUR RUN"
    : game.ranked ? "RANKED · REPLAY CHECKED · 2 MIN" : selected === "pacman" ? "CLASSIC LOCAL · ON THIS DEVICE" : "LOCAL PRACTICE · ON THIS DEVICE";
}
function updateHud(definition: GameDefinition, simulation: ArcadeSimulation) {
  const score = simulation.state.score;
  if (score > localBest(definition.id)) saveBest(definition.id, score);
  const all = definition.hud(simulation);
  const important = all.filter(item => item.kind);
  const extra = (important.length ? important : all).slice(0, 3);
  if (definition.id === "midnight-pinball") {
    const tour = all.find(item => item.label === "ISLAND TOUR");
    const table = all.find(item => item.label === "TILT" || item.label === "TABLE");
    const feedback = all.find(item => item.label === "NIGHT SHIFT");
    $("play-objective").textContent = table?.label === "TILT" ? "TILT · flippers disabled until the next ball."
      : `3 stars → left ramp: multiball. Ramp + river: Island Tour. ${tour?.value ?? ""} · ${feedback?.value ?? ""}`;
  }
  const seconds = Math.max(0, Math.ceil((MAX_TICKS - simulation.state.tick) / TICK_RATE));
  const signature = `${score}:${seconds}:${extra.map(item => `${item.label}:${item.value}`).join("|")}`;
  if (signature === hudSignature) return; hudSignature = signature;
  $("hud-score").textContent = score.toLocaleString(); $("hud-time").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  $("hud-extras").replaceChildren(...extra.map(item => {
    const element = document.createElement("div"); element.className = `hud-item ${item.kind ?? ""}`;
    const label = document.createElement("span"), value = document.createElement("strong"); label.textContent = item.label; value.textContent = item.value;
    element.append(label, value); return element;
  }));
  updateMode();
}
function releaseGame() {
  revision++; controller?.dispose(); controller = null; pacman?.dispose(); pacman = null;
  result = null; resultAccepted = false; submitting = false; hudSignature = ""; audio.pause();
  for (const dialog of Object.values(dialogs)) if (dialog.open) dialog.close();
}
async function launch(id: GameId) {
  releaseGame(); showroom?.dispose(); showroom = null;
  selected = id; const version = revision;
  $("play-objective").hidden = id !== "midnight-pinball";
  $("play-objective").textContent = id === "midnight-pinball" ? "3 stars → left ramp: multiball. Left ramp + right river: Island Tour." : "";
  $("score-save-status").textContent = "Choose ranked for global scores, or practice for a local best.";
  $("arcade-home").hidden = true; $("arcade-play").hidden = false;
  const cabinet = cabinets.find(item => item.id === id)!;
  document.title = `${cabinet.title} · After Hours Arcade`;
  $("play-title").textContent = cabinet.title;
  document.body.style.setProperty("--game-accent", cabinet.accent);
  document.body.classList.remove("play-controls-drive", "play-controls-paddle", "play-controls-twin-stick", "play-controls-flippers", "playing-pacman");
  showOverlay("loading", cabinet.title, "Warming up the cabinet…");
  $("hud-score").textContent = "0"; $("hud-time").textContent = "2:00"; $("hud-extras").replaceChildren();
  if (id === "pacman") {
    document.body.classList.add("playing-pacman"); $("touch-controls").hidden = true;
    $("play-instructions").textContent = "Arrows / WASD or swipe / D-pad · queue turns early · classic local play or a two-minute ranked challenge.";
    pacman = new PacmanAdapter($("play-stage"), {
      overlay: showOverlay, result: showResult, notice, isModalOpen: modalOpen,
      fullscreen: () => void toggleFullscreen(),
      hud: info => {
        $("hud-score").textContent = info.score.toLocaleString();
        const max = pacman?.ranked?.maxTicks ?? 7272;
        const seconds = Math.max(0, Math.ceil((max - info.frames) / 60.60606060606061));
        $("hud-time").textContent = pacman?.ranked ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : `LEVEL ${String(info.level).padStart(2, "0")}`;
        if (info.score > localBest("pacman")) saveBest("pacman", info.score);
        updateMode();
      },
    });
    pacman.settings(preference);
    updateMode(); return;
  }
  if (!webgl2Available) {
    $("touch-controls").hidden = true;
    showOverlay("unavailable", `${cabinet.title} needs WebGL 2.`, "This browser cannot open this 3D cabinet. PAC-MAN can use its graphics fallback, and all global leaderboards remain available from the arcade.");
    $("play-objective").hidden = true;
    $("score-save-status").textContent = "No run started · no score to save.";
    return;
  }
  $("touch-controls").hidden = false;
  const game = new ArcadeController(id as NewGameId, $("play-stage"), audio, {
    overlay: showOverlay, hud: updateHud, result: showResult, notice, isModalOpen: modalOpen,
  });
  controller = game;
  try {
    await game.load(); if (version !== revision || controller !== game) return;
    const definition = game.definition!;
    document.body.classList.add(`play-controls-${definition.controls}`);
    $("touch-primary").textContent = definition.primaryLabel;
    $("touch-secondary").textContent = definition.secondaryLabel;
    $("touch-launch").textContent = "Launch";
    $("play-instructions").textContent = matchMedia("(pointer: coarse)").matches ? definition.touchInstructions : definition.desktopInstructions;
    requestAnimationFrame(() => game.resize()); updateMode();
  } catch (error) { notice(error instanceof Error ? error.message : "This cabinet could not load."); showOverlay("unavailable", "Cabinet unavailable.", "Return to the arcade and try another game."); }
}
function homeNow() {
  releaseGame(); selected = null;
  $("arcade-play").hidden = true; $("arcade-home").hidden = false;
  document.body.classList.remove("playing-pacman");
  document.title = "After Hours Arcade · One more round.";
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  showroom = new Showroom($("showroom"), preference.reducedMotion, featuredIndex, webgl2Available); updateBests();
  void board.refresh(true); $("home-brand").focus({ preventScroll: true });
}
function requestSwitch(action: () => void) {
  const game = active();
  if (game?.active) {
    resumeAfterSwitch = ["playing", "countdown"].includes(game.phase);
    game.pause(); pendingSwitch = action; dialogs.switch.showModal();
  } else action();
}
function keepPlaying() {
  dialogs.switch.close(); pendingSwitch = null;
  if (resumeAfterSwitch && active()?.paused) active()?.togglePause();
  resumeAfterSwitch = false;
}
function openSettings() {
  const game = active(); resumeAfterModal = !!game && ["playing", "countdown"].includes(game.phase);
  game?.pause(); dialogs.settings.showModal();
}
function closeSettings() {
  dialogs.settings.close(); if (resumeAfterModal && active()?.paused) active()?.togglePause(); resumeAfterModal = false;
}
function settingsChanged() {
  preference.muted = $<HTMLInputElement>("setting-mute").checked;
  preference.reducedMotion = $<HTMLInputElement>("setting-motion").checked;
  preference.highContrast = $<HTMLInputElement>("setting-contrast").checked;
  store.set("muted", String(preference.muted)); store.set("motion", preference.reducedMotion ? "reduced" : "full"); store.set("contrast", preference.highContrast ? "high" : "normal");
  document.body.classList.toggle("reduced-motion", preference.reducedMotion);
  document.body.classList.toggle("high-contrast", preference.highContrast);
  audio.setMuted(preference.muted); pacman?.settings(preference);
  controller?.resize();
  $("play-mute-button").setAttribute("aria-label", preference.muted ? "Enable sound" : "Mute sound");
  $("play-mute-button").setAttribute("aria-pressed", String(preference.muted));
  const label = $("play-mute-button").querySelector(".button-label"); if (label) label.textContent = preference.muted ? "Muted" : "Sound";
  if (!$("arcade-home").hidden) { showroom?.dispose(); showroom = new Showroom($("showroom"), preference.reducedMotion, featuredIndex, webgl2Available); }
}
function showHelp() {
  if (pacman) {
    if (["intro", "loading", "preparing"].includes(pacman.phase)) {
      pacman.pause(); resumeAfterModal = false;
      $("instructions-copy").textContent = "Move with arrow keys / WASD, swipe the maze or use its D-pad. Queue a turn before the corner. Clear all 244 dots and power pellets; only frightened ghosts are edible.\n\nClassic local play keeps the original one- or two-player game. Ranked play is a single-player two-minute challenge using a server-issued seed and replay-checked global score.\n\nP pauses, M changes sound, F changes fullscreen. The original game's help explains the four ghost personalities and scoring.";
      dialogs.instructions.showModal();
    } else pacman.showHelp();
    return;
  }
  const game = controller; if (!game?.definition) return;
  resumeAfterModal = ["playing", "countdown"].includes(game.phase); game.pause();
  $("instructions-copy").textContent = `${game.definition.desktopInstructions}\n\n${game.definition.touchInstructions}\n\nRanked runs last up to two minutes and use a server-issued seed. Scores are replay checked before entering the persistent global board. Pause and menus freeze the game; returning gives a three-second countdown. Local practice stays on this device.`;
  dialogs.instructions.showModal();
}
function closeHelp() {
  dialogs.instructions.close(); if (resumeAfterModal && active()?.paused) active()?.togglePause(); resumeAfterModal = false;
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.fullscreenEnabled && $("arcade-play").requestFullscreen) await $("arcade-play").requestFullscreen({ navigationUI: "hide" });
    else notice("This browser does not offer fullscreen. The play view already uses the available viewport.");
  } catch { notice("Fullscreen could not open. The expanded play view remains available."); }
}
function showResult(finished: FinishedRun) {
  if (finished.game !== selected) return;
  result = finished; resultAccepted = false; submitting = false;
  $("score-save-status").textContent = finished.run ? "Global score not saved · enter initials and choose Save global score." : "Practice complete · local best only · no global score submitted.";
  saveBest(finished.game, finished.score); updateBests();
  $("result-title").textContent = finished.victory ? "Night well spent." : "One more round?";
  $("result-score").textContent = finished.score.toLocaleString();
  $("result-copy").textContent = finished.run ? "Three letters. A place on the real global board. Your replay will be checked before the score is saved." : "Saved as a local best on this device. Local practice does not enter the global rankings.";
  $("initials-field").hidden = !finished.run; $("score-submit").hidden = !finished.run;
  $<HTMLButtonElement>("score-submit").disabled = false; $("score-submit").textContent = "Save global score";
  $<HTMLInputElement>("score-initials").value = store.get("initials") ?? "";
  $<HTMLInputElement>("score-initials").disabled = false;
  $("score-feedback").textContent = finished.run ? "Initials are display labels, not accounts. Duplicate initials are welcome." : "Global records are stored in the shared database; local records are separate.";
  dialogs.scores.showModal(); announce(`Run complete. ${finished.score} points.`);
}
$("score-form").addEventListener("submit", async event => {
  event.preventDefault(); if (!result?.run || submitting || resultAccepted) return;
  const initials = $<HTMLInputElement>("score-initials").value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(initials)) { $("score-feedback").textContent = "Enter exactly three letters, A–Z."; $("score-initials").focus(); return; }
  submitting = true; $<HTMLButtonElement>("score-submit").disabled = true;
  $("score-feedback").textContent = "Checking your replay and saving the real score…";
  $("score-save-status").textContent = "Global score · verifying replay and saving…";
  const snapshot = result;
  try {
    const accepted = await submitRun(snapshot.run!, initials, snapshot.frames, snapshot.inputs, snapshot.score);
    if (result !== snapshot) return;
    resultAccepted = true; store.set("initials", accepted.entry.initials);
    $("score-feedback").textContent = "Saved to the persistent global leaderboard. Available to players on every device.";
    $("score-save-status").textContent = "Global score saved · available across devices.";
    $("score-submit").textContent = "Score saved"; $<HTMLInputElement>("score-initials").disabled = true;
    board.select(snapshot.game); announce("Your replay-checked score is on the global board.");
  } catch (error) {
    if (result !== snapshot) return;
    $("score-save-status").textContent = "Global score not saved · see the result message for next steps.";
    $("score-feedback").textContent = `${error instanceof Error ? error.message : "The score could not be submitted."} Your local best is saved.`;
    if (error instanceof ApiError && ["run_expired", "ruleset_mismatch", "invalid_replay", "score_mismatch"].includes(error.code)) $("score-submit").hidden = true;
    else $<HTMLButtonElement>("score-submit").disabled = false;
  } finally { if (result === snapshot) submitting = false; }
});
$("score-initials").addEventListener("input", event => {
  const input = event.target as HTMLInputElement; input.value = input.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 3);
});
for (const button of document.querySelectorAll<HTMLElement>("[data-game]")) button.addEventListener("click", () => requestSwitch(() => void launch(button.dataset.game as GameId)));
for (const id of ["play-pause-button", "play-restart-button", "play-mute-button", "play-help-button", "play-fullscreen-button", "play-settings-button"])
  $(id).addEventListener("pointerdown", event => { if (pacman) event.preventDefault(); });
let featuredIndex = 0;
const featuredPanel = document.querySelector<HTMLElement>(".hero-panel")!;
function showFeatured(index: number) {
  featuredIndex = (index + cabinets.length) % cabinets.length;
  const cabinet = cabinets[featuredIndex];
  $("hero-title").textContent = cabinet.title;
  $("featured-copy").textContent = `${cabinet.genre} · ${cabinet.copy}`;
  $("featured-play-label").textContent = !webgl2Available && cabinet.id !== "pacman" ? "View requirements" : `Play ${cabinet.title}`;
  $("featured-caption").textContent = `FEATURED · ${cabinet.title}`;
  $("featured-position").textContent = `${String(featuredIndex + 1).padStart(2, "0")} / ${String(cabinets.length).padStart(2, "0")}`;
  featuredPanel.style.setProperty("--featured-accent", cabinet.accent);
  showroom?.setFeatured(featuredIndex);
}
$("featured-previous").addEventListener("click", () => showFeatured(featuredIndex - 1));
$("featured-next").addEventListener("click", () => showFeatured(featuredIndex + 1));
$("quick-play").addEventListener("click", () => requestSwitch(() => void launch(cabinets[featuredIndex].id)));
let autoRotate = true;
$("featured-toggle").addEventListener("click", () => {
  autoRotate = !autoRotate;
  $("featured-toggle").textContent = autoRotate ? "Pause rotation" : "Rotate features";
  $("featured-toggle").setAttribute("aria-pressed", String(!autoRotate));
});
const featuredTimer = window.setInterval(() => {
  if (autoRotate && !document.hidden && !$("arcade-home").hidden && !preference.reducedMotion && !matchMedia("(prefers-reduced-motion: reduce)").matches && !featuredPanel.matches(":hover, :focus-within")) showFeatured(featuredIndex + 1);
}, 7000);
window.addEventListener("pagehide", () => clearInterval(featuredTimer), { once: true });
showFeatured(0);
$("home-brand").addEventListener("click", event => { event.preventDefault(); if (selected) requestSwitch(homeNow); });
$("play-home-button").addEventListener("click", () => requestSwitch(homeNow));
$("play-start-button").addEventListener("click", () => void active()?.start("ranked"));
$("play-practice-button").addEventListener("click", () => {
  if (!active() || controller?.phase === "unavailable") void launch("pacman"); else void active()?.start("practice");
});
guardedActivation($("play-resume-button"), () => active()?.togglePause());
$("play-keep-paused").addEventListener("click", () => active()?.pause());
$("play-keep-paused").addEventListener("pointerup", event => {
  if (event.pointerType === "touch" || event.pointerType === "pen") {
    event.preventDefault(); active()?.pause();
  }
});
$("play-pause-button").addEventListener("click", () => active()?.togglePause());
$("play-restart-button").addEventListener("click", () => requestSwitch(() => void active()?.restart()));
$("play-fullscreen-button").addEventListener("click", () => void toggleFullscreen());
$("play-mute-button").addEventListener("click", () => { $<HTMLInputElement>("setting-mute").checked = !preference.muted; settingsChanged(); });
$("play-help-button").addEventListener("click", showHelp);
$("settings-button").addEventListener("click", openSettings);
$("play-settings-button").addEventListener("click", openSettings);
$("settings-close").addEventListener("click", closeSettings);
$("instructions-close").addEventListener("click", closeHelp);
for (const name of ["setting-mute", "setting-motion", "setting-contrast"]) $(name).addEventListener("change", settingsChanged);
$("switch-keep").addEventListener("click", keepPlaying);
$("switch-confirm").addEventListener("click", () => { const action = pendingSwitch; pendingSwitch = null; dialogs.switch.close(); action?.(); });
$("result-again").addEventListener("click", () => { dialogs.scores.close(); void active()?.restart(); });
$("result-home").addEventListener("click", () => { const id = result?.game; dialogs.scores.close(); homeNow(); if (id) board.select(id); });
dialogs.settings.addEventListener("cancel", event => { event.preventDefault(); closeSettings(); });
dialogs.instructions.addEventListener("cancel", event => { event.preventDefault(); closeHelp(); });
dialogs.switch.addEventListener("cancel", event => { event.preventDefault(); keepPlaying(); });
document.addEventListener("fullscreenchange", () => {
  const value = !!document.fullscreenElement; if (wasFullscreen && !value) lastFullscreenExit = performance.now(); wasFullscreen = value;
  $("play-fullscreen-button").setAttribute("aria-label", value ? "Exit fullscreen" : "Enter fullscreen");
  $("play-fullscreen-button").setAttribute("aria-pressed", String(value));
  $("play-fullscreen-button").title = value ? "Exit fullscreen (F)" : "Fullscreen (F)";
  $("play-fullscreen-button").querySelector("path")?.setAttribute("d", value ? "M3 7h4V3m6 0v4h4M7 17v-4H3m14 0h-4v4" : "M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4");
  controller?.resize();
});
window.addEventListener("keydown", event => {
  if (!selected || modalOpen() || event.ctrlKey || event.metaKey || event.altKey || event.repeat || (event.target instanceof Element && event.target.closest("input,textarea,select"))) return;
  const key = event.key.toLowerCase();
  if (key === "f") { event.preventDefault(); void toggleFullscreen(); }
  else if (key === "p") { event.preventDefault(); active()?.togglePause(); }
  else if (key === "escape") {
    event.preventDefault();
    if (document.fullscreenElement) void toggleFullscreen();
    else if (performance.now() - lastFullscreenExit > 250) active()?.pause();
  } else if (key === "m") { event.preventDefault(); $("play-mute-button").click(); }
});
window.addEventListener("blur", () => {
  // Focusing the same-origin game iframe blurs the host window. The child
  // already pauses on real background/visibility loss and owns that event.
  if (pacman && document.activeElement === pacman.iframe) return;
  active()?.pause();
});
document.addEventListener("visibilitychange", () => { if (document.hidden) { active()?.pause(); audio.pause(); } });
let resizeRaf = 0;
const fit = () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => {
  controller?.resize(); showroom?.resize();
  if (controller?.definition) $("play-instructions").textContent = matchMedia("(pointer: coarse)").matches ? controller.definition.touchInstructions : controller.definition.desktopInstructions;
}); };
window.addEventListener("resize", fit); window.addEventListener("orientationchange", fit); window.visualViewport?.addEventListener("resize", fit);
if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe($("play-stage"));
window.addEventListener("pagehide", () => { releaseGame(); showroom?.dispose(); board.dispose(); audio.dispose(); });
$<HTMLInputElement>("setting-mute").checked = preference.muted;
$<HTMLInputElement>("setting-motion").checked = preference.reducedMotion;
$<HTMLInputElement>("setting-contrast").checked = preference.highContrast;
settingsChanged(); updateBests();
if (import.meta.env.DEV) Object.assign(window, { __ARCADE__: {
  get simulation() { return controller?.simulation ?? null; },
  get controller() { return controller ?? pacman; },
  get selection() { return selected; },
  get pacman() { return pacman; },
  select: launch, start: (mode: "ranked" | "practice" = "practice") => active()?.start(mode),
  home: homeNow, get result() { return result; },
} });

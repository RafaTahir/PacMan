import { issueRun, type RankedRun } from "./api";
import type { FinishedRun } from "./controller";
import { PACMAN_BRIDGE, isBridgeEnvelope, isPacmanFinished, isPacmanHud, isPacmanGraphics, type PacmanGraphics, type HostCommand, type PacmanHud, type PacmanSettings } from "../pacman-host";

export interface PacmanCallbacks {
  overlay: (phase: string, title: string, copy: string, countdown?: number) => void;
  result: (result: FinishedRun) => void;
  notice: (text: string) => void;
  hud: (info: PacmanHud) => void;
  isModalOpen: () => boolean;
  fullscreen?: () => void;
}

export class PacmanAdapter {
  readonly selection = "pacman" as const;
  readonly iframe: HTMLIFrameElement;
  phase = "loading";
  ranked: RankedRun | null = null;
  private ready = false;
  private graphics: PacmanGraphics | null = null;
  private revision = 0;
  private session = 0;
  private delivered = false;
  private preparationInterrupted = false;
  private lastMode: "ranked" | "practice" = "practice";
  private pendingSettings: PacmanSettings | null = null;
  private timeout = 0;
  private waiters: Array<(ready: boolean) => void> = [];
  private readonly origin = window.location.origin;

  constructor(private readonly mount: HTMLElement, private readonly callbacks: PacmanCallbacks) {
    this.iframe = document.createElement("iframe");
    this.iframe.id = "pacman-frame";
    this.iframe.src = "/pacman.html?arcade=1";
    this.iframe.title = "Pac-Man — original arcade game";
    this.iframe.allow = "autoplay; fullscreen";
    this.iframe.allowFullscreen = true;
    this.iframe.style.cssText = "width:100%;height:100%;border:0;display:block;min-height:0;";
    window.addEventListener("message", this.receive);
    window.addEventListener("blur", this.background);
    document.addEventListener("visibilitychange", this.background);
    this.iframe.addEventListener("load", this.loaded);
    this.mount.append(this.iframe);
    this.callbacks.overlay("loading", "PAC-MAN", "Opening the original cabinet…");
    this.timeout = window.setTimeout(() => {
      if (this.ready || this.phase === "disposed") return;
      this.phase = "unavailable";
      this.resolveWaiters(false);
      this.callbacks.notice("Pac-Man did not finish loading. Return to the arcade and try again.");
      this.callbacks.overlay("unavailable", "Cabinet unavailable.", "The original game did not answer in time. Return to the arcade and try again.");
    }, 10_000);
  }

  get paused(): boolean { return this.phase !== "playing"; }
  get active(): boolean { return ["preparing", "playing", "paused", "countdown"].includes(this.phase); }

  async start(mode: "ranked" | "practice"): Promise<void> {
    if (this.phase === "disposed" || this.phase === "preparing" || this.phase === "unavailable") return;
    const revision = ++this.revision;
    this.phase = "preparing";
    this.preparationInterrupted = false;
    this.lastMode = mode;
    this.ranked = null;
    this.delivered = false;
    this.callbacks.overlay("preparing", "PAC-MAN", mode === "ranked" ? "Requesting your two-minute global challenge…" : "Opening classic local play…");
    if (!await this.whenReady() || revision !== this.revision || this.isDisposed()) return;
    if (mode === "ranked") {
      try { this.ranked = await issueRun("pacman"); }
      catch (error) {
        if (revision !== this.revision || this.isDisposed()) return;
        this.callbacks.notice(`${error instanceof Error ? error.message : "The global challenge could not start."} Classic local play is available; this run will not enter the global board.`);
      }
    }
    if (revision !== this.revision || this.isDisposed()) return;
    this.session++;
    const holdPaused = this.preparationInterrupted || document.hidden || !document.hasFocus() || this.callbacks.isModalOpen();
    this.phase = holdPaused ? "paused" : "playing";
    this.post({ type: "start", session: this.session, mode: this.ranked ? "ranked" : "practice", seed: this.ranked?.seed, maxTicks: this.ranked?.maxTicks, paused: holdPaused });
    if (this.pendingSettings) this.post({ type: "settings", settings: this.pendingSettings });
    this.callbacks.overlay(this.phase, "PAC-MAN", "");
    if (!holdPaused) this.iframe.focus();
  }

  pause(): void {
    if (!this.active) return;
    if (this.phase === "preparing") this.preparationInterrupted = true;
    this.post({ type: "pause" });
    if (this.phase !== "preparing") this.phase = "paused";
  }
  togglePause(): void { if (this.active) { this.post({ type: "toggle-pause" }); this.iframe.focus(); } }
  restart(): Promise<void> { return this.start(this.lastMode); }
  showHelp(): void {
    if (this.isDisposed()) return;
    if (this.phase === "preparing") this.preparationInterrupted = true;
    this.post({ type: "help" });
    this.iframe.focus();
  }
  settings(settings: PacmanSettings): void {
    this.pendingSettings = { ...settings };
    if (this.ready && !this.isDisposed()) this.post({ type: "settings", settings: this.pendingSettings });
  }

  dispose(): void {
    if (this.isDisposed()) return;
    this.revision++;
    this.post({ type: "dispose" });
    this.phase = "disposed";
    clearTimeout(this.timeout);
    this.resolveWaiters(false);
    window.removeEventListener("message", this.receive);
    window.removeEventListener("blur", this.background);
    document.removeEventListener("visibilitychange", this.background);
    this.iframe.removeEventListener("load", this.loaded);
    this.iframe.remove();
    this.ranked = null;
  }

  private introCopy(): string {
    const graphics = this.graphics === "webgl" ? "3D mesh graphics" : this.graphics === "canvas-fallback"
      ? "2D fallback graphics (3D is unavailable in this browser)" : "graphics selected by your browser";
    return `The original maze with ${graphics}, sound and two-player classic. Choose a two-minute global challenge or classic local play.`;
  }
  private isDisposed(): boolean { return this.phase === "disposed"; }
  private post(command: HostCommand): void { this.iframe.contentWindow?.postMessage({ channel: PACMAN_BRIDGE, ...command }, this.origin); }
  private loaded = (): void => { this.post({ type: "hello" }); };
  private background = (): void => {
    // Focusing this iframe also blurs the parent window; it is still visible play.
    if (document.hidden || (document.activeElement !== this.iframe && !document.hasFocus())) this.pause();
  };
  private whenReady(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (this.isDisposed() || this.phase === "unavailable") return Promise.resolve(false);
    return new Promise(resolve => this.waiters.push(resolve));
  }
  private resolveWaiters(ready: boolean): void { for (const resolve of this.waiters.splice(0)) resolve(ready); }
  private receive = (event: MessageEvent): void => {
    if (this.isDisposed() || event.origin !== this.origin || event.source !== this.iframe.contentWindow || !isBridgeEnvelope(event.data)) return;
    const message = event.data;
    if (message.type === "ready") {
      if (message.graphics !== undefined && !isPacmanGraphics(message.graphics)) return;
      if (isPacmanGraphics(message.graphics)) this.graphics = message.graphics;
      this.ready = true;
      clearTimeout(this.timeout);
      this.resolveWaiters(true);
      if (this.pendingSettings) this.post({ type: "settings", settings: this.pendingSettings });
      if (this.phase === "loading" || this.phase === "intro") {
        this.phase = "intro";
        this.callbacks.overlay("intro", "PAC-MAN", this.introCopy());
      }
      return;
    }
    if (message.session !== this.session || this.session === 0) return;
    if (message.type === "status" && isPacmanHud(message.hud) && typeof message.phase === "string" && ["intro", "playing", "paused", "countdown", "ended"].includes(message.phase)) {
      if (this.delivered || (message.graphics !== undefined && !isPacmanGraphics(message.graphics))) return;
      if (isPacmanGraphics(message.graphics)) this.graphics = message.graphics;
      this.phase = message.phase;
      this.callbacks.hud(message.hud);
      if (["playing", "paused", "countdown", "intro"].includes(this.phase)) this.callbacks.overlay(this.phase === "intro" ? "playing" : this.phase, "PAC-MAN", "", typeof message.countdown === "number" ? message.countdown : undefined);
    } else if (message.type === "finished" && !this.delivered && isPacmanFinished(message.result, this.ranked?.maxTicks ?? null)) {
      this.delivered = true;
      this.phase = "ended";
      const result = message.result;
      this.callbacks.result({ game: "pacman", score: result.score, frames: result.frames, inputs: result.inputs.map(row => [...row]), run: this.ranked, victory: result.victory });
    } else if (message.type === "restart") {
      void this.restart();
    } else if (message.type === "menu") {
      this.ranked = null;
      this.delivered = true;
      this.phase = "intro";
      this.callbacks.overlay("intro", "PAC-MAN", this.introCopy());
    } else if (message.type === "fullscreen") this.callbacks.fullscreen?.();
  };
}

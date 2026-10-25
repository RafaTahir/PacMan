import { ArcadeControls } from "./controls";
import { ArcadeSound } from "./audio";
import { issueRun, type RankedRun } from "./api";
import { loadGame } from "./catalog";
import { ReplayRecorder } from "./replay";
import { Stage } from "./scene";
import { preference } from "./preferences";
import { DT, MAX_TICKS, type ArcadeSimulation, type ArcadeView, type GameDefinition, type GameId, type NewGameId, type ReplayInput } from "./shared/contracts";

export interface FinishedRun { game: GameId; score: number; frames: number; inputs: ReplayInput[]; run: RankedRun | null; victory: boolean }
type Phase = "loading" | "intro" | "preparing" | "countdown" | "playing" | "paused" | "ended" | "unavailable" | "disposed";
export interface ControllerCallbacks {
  overlay: (phase: Phase, title: string, copy: string, countdown?: number) => void;
  hud: (definition: GameDefinition, simulation: ArcadeSimulation) => void;
  result: (result: FinishedRun) => void;
  notice: (text: string) => void;
  isModalOpen: () => boolean;
}
export class ArcadeController {
  simulation: ArcadeSimulation | null = null;
  definition: GameDefinition | null = null;
  input: ArcadeControls | null = null;
  stage: Stage | null = null;
  phase: Phase = "loading";
  countdown = 0;
  ranked: RankedRun | null = null;
  private view: ArcadeView | null = null;
  private recorder = new ReplayRecorder();
  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  private lastHud = 0;
  private lastCount = 0;
  private startRevision = 0;
  private preparationInterrupted = false;
  private lastMode: "ranked" | "practice" = "practice";
  private drawDirty = true;
  private beforeContextLoss: Phase = "paused";
  constructor(readonly selection: NewGameId, private mount: HTMLElement, private audio: ArcadeSound, private callbacks: ControllerCallbacks) {}
  get paused(): boolean { return this.phase !== "playing"; }
  get active(): boolean { return ["playing", "paused", "countdown", "preparing"].includes(this.phase); }
  async load(): Promise<void> {
    const definition = await loadGame(this.selection);
    if (this.phase === "disposed") return;
    this.definition = definition;
    this.callbacks.overlay("loading", definition.title, "Warming up the cabinet…");
    if (!this.build(1980)) return;
    this.phase = "intro";
    this.callbacks.overlay("intro", definition.title, `${definition.description} Two-minute runs. Choose a global challenge or local practice.`);
    this.raf = requestAnimationFrame(this.frame);
  }
  private build(seed: number): boolean {
    this.releaseScene();
    if (!this.definition) return false;
    this.simulation = this.definition.createSimulation(seed);
    this.recorder = new ReplayRecorder(); this.accumulator = 0; this.lastTime = 0;
    try {
      const stage = new Stage(this.mount, () => {
        if (this.stage !== stage || this.phase === "disposed") return;
        this.beforeContextLoss = this.phase;
        this.pause();
        // Remove old native-resource disposal listeners while the old context
        // is lost, before Three replaces its internal managers on restoration.
        this.view?.dispose(); this.view = null;
        this.phase = "unavailable";
        this.callbacks.overlay("unavailable", "Graphics paused.", "The browser lost its 3D graphics context. Your game stays still while it recovers.");
      }, () => {
        if (this.stage !== stage || this.phase === "disposed") return;
        if (!this.definition || !this.simulation) return;
        try {
          this.view = this.definition.createView(stage, this.simulation); this.resize();
          this.phase = this.beforeContextLoss === "intro" ? "intro" : this.beforeContextLoss === "ended" ? "ended" : "paused";
          this.lastTime = 0;
          this.callbacks.overlay(this.phase, this.phase === "intro" ? this.definition.title : "Back in the light.",
            this.phase === "intro" ? this.definition.description : "3D graphics recovered. Resume when you’re ready.");
        } catch { this.phase = "unavailable"; this.callbacks.overlay("unavailable", "Graphics could not recover.", "Return to the arcade and reopen the cabinet. Your local best is safe."); }
      });
      this.stage = stage;
      this.view = this.definition.createView(stage, this.simulation);
      this.input = new ArcadeControls(this.definition, this.mount,
        () => ["playing", "countdown"].includes(this.phase) && !this.callbacks.isModalOpen() && !document.hidden,
        (x, y) => this.view?.aimAt?.(x, y) ?? { aimX: Math.round(x * 127), aimY: Math.round(y * 127) });
      this.resize(); this.view.update(0, preference); stage.draw(); this.callbacks.hud(this.definition, this.simulation);
      return true;
    } catch (error) {
      this.releaseScene(); this.phase = "unavailable";
      this.callbacks.overlay("unavailable", "3D graphics unavailable.", "This cabinet needs WebGL 2. Pac-Man’s explicitly labelled 2D fallback is still available. Try another browser or return to the arcade.");
      this.callbacks.notice(error instanceof Error ? `The browser could not open this 3D cabinet: ${error.message}` : "3D graphics could not start.");
      return false;
    }
  }
  async start(mode: "ranked" | "practice" = "ranked"): Promise<void> {
    if (!this.definition || this.phase === "disposed" || this.phase === "preparing") return;
    const revision = ++this.startRevision;
    this.preparationInterrupted = false;
    this.phase = "preparing"; this.input?.clear(); this.audio.setMuted(preference.muted); void this.audio.unlock();
    this.callbacks.overlay("preparing", "One more round.", mode === "ranked" ? "Requesting your server-issued challenge…" : "Starting a local practice run…");
    this.lastMode = mode; this.ranked = null;
    if (mode === "ranked") {
      try { this.ranked = await issueRun(this.selection); }
      catch (error) { this.callbacks.notice(`${error instanceof Error ? error.message : "Global challenge unavailable."} Starting local practice; it will not enter the global board.`); }
    }
    if (revision !== this.startRevision) return;
    const seed = this.ranked?.seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] || 1);
    if (!this.build(seed)) return;
    this.phase = "paused";
    if (this.preparationInterrupted || document.hidden || !document.hasFocus() || this.callbacks.isModalOpen()) this.callbacks.overlay("paused", "Ready when you are.", "Your new run is waiting. Resume deliberately when you return.");
    else this.resume();
  }
  restart(): Promise<void> { return this.start(this.lastMode); }
  pause(): void {
    if (this.phase === "preparing") { this.preparationInterrupted = true; this.input?.clear(); this.audio.pause(); return; }
    if (!["playing", "countdown", "paused"].includes(this.phase)) return;
    this.phase = "paused"; this.countdown = 0; this.accumulator = 0; this.lastTime = 0;
    this.input?.clear(); this.audio.pause();
    this.callbacks.overlay("paused", "Take a breather.", "The whole game is still. Resume gives you three seconds to get ready.");
  }
  resume(): void {
    if (this.phase !== "paused" || document.hidden || this.callbacks.isModalOpen()) return;
    this.phase = "countdown"; this.countdown = 3; this.lastCount = 3; this.lastTime = 0; this.accumulator = 0;
    this.input?.clear(); void this.audio.unlock();
    this.callbacks.overlay("countdown", "Find your rhythm.", "Choose your direction. The game stays still until the countdown ends.", 3);
  }
  togglePause(): void { if (this.phase === "paused") this.resume(); else this.pause(); }
  resize(): void {
    if (!this.stage || !this.view) return;
    this.stage.resize(); this.view.resize(this.stage.width, this.stage.height);
    this.drawDirty = true;
  }
  private frame = (timestamp: number) => {
    if (this.phase === "disposed") return;
    let delta = this.lastTime ? Math.min(0.1, Math.max(0, (timestamp - this.lastTime) / 1000)) : 0;
    this.lastTime = timestamp;
    if (document.hidden && ["playing", "countdown"].includes(this.phase)) this.pause();
    if (this.phase === "countdown") {
      this.countdown = Math.max(0, this.countdown - delta);
      if (this.countdown < 1e-8) {
        this.countdown = 0; this.phase = "playing"; this.accumulator = 0; delta = 0;
        this.callbacks.overlay("playing", "", "");
      } else if (Math.ceil(this.countdown) !== this.lastCount) {
        this.lastCount = Math.ceil(this.countdown);
        this.callbacks.overlay("countdown", "Find your rhythm.", "Choose your direction. The game stays still until the countdown ends.", this.lastCount);
      }
    }
    if (this.phase === "playing" && this.simulation && this.input) {
      this.accumulator += delta;
      while (this.accumulator + 1e-10 >= DT && this.phase === "playing") {
        const input = this.input.read();
        this.recorder.record(this.simulation.state.tick, input);
        this.audio.handle(this.selection, this.simulation.step(input)); this.accumulator -= DT;
        if (this.simulation.state.status !== "playing" || this.simulation.state.tick >= MAX_TICKS) this.finish();
      }
    }
    if (this.view && this.stage) {
      if (["playing", "countdown"].includes(this.phase) || this.drawDirty) {
        this.view.update(Math.max(0, this.accumulator / DT), preference); this.stage.draw(); this.drawDirty = false;
      }
      if (timestamp - this.lastHud > 100 && this.definition && this.simulation) {
        this.callbacks.hud(this.definition, this.simulation); this.lastHud = timestamp;
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  private finish(): void {
    if (!this.simulation || this.phase === "ended") return;
    this.phase = "ended"; this.countdown = 0; this.input?.clear();
    this.callbacks.overlay("ended", "A good run.", "Your score is ready.");
    this.callbacks.result({ game: this.selection, score: this.simulation.state.score,
      frames: this.simulation.state.tick, inputs: this.recorder.snapshot(), run: this.ranked,
      victory: this.simulation.state.status === "victory" });
  }
  private releaseScene(): void {
    this.input?.dispose(); this.input = null; this.view?.dispose(); this.view = null;
    const stage = this.stage; this.stage = null; stage?.dispose();
  }
  dispose(): void {
    this.phase = "disposed"; this.startRevision++; cancelAnimationFrame(this.raf);
    this.audio.pause(); this.releaseScene(); this.simulation = null;
  }
}

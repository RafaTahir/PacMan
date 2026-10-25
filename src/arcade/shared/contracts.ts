import type * as THREE from "three";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const MAX_TICKS = TICK_RATE * 120;
export const RULESET_VERSION = "after-hours-v1";
export type NewGameId = "neon-rally" | "reactor-breaker" | "chrome-siege" | "midnight-pinball";
export type GameId = "pacman" | NewGameId;
export const GAME_IDS: readonly GameId[] = ["pacman", "neon-rally", "reactor-breaker", "chrome-siege", "midnight-pinball"];
export const Buttons = { PRIMARY: 1, SECONDARY: 2, LAUNCH: 4, POINTER: 8 } as const;

/** Signed integer axes (-127..127). Aim is a direction; breaker uses aimX as
 * the absolute paddle target when POINTER is set. Inputs are replayed exactly. */
export interface ArcadeInput {
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  buttons: number;
}
export const NEUTRAL_INPUT: Readonly<ArcadeInput> = { x: 0, y: 0, aimX: 0, aimY: -127, buttons: 0 };
export type ReplayInput = [tick: number, x: number, y: number, aimX: number, aimY: number, buttons: number];
export type RunStatus = "playing" | "gameover" | "victory";
export interface ArcadeState {
  seed: number;
  tick: number;
  score: number;
  status: RunStatus;
}
export type SignalType = "score" | "hit" | "death" | "boost" | "near-miss" | "bounce" | "chain" | "shot" | "dash" | "upgrade" | "boss" | "multiball" | "win" | "lose";
export interface GameSignal { type: SignalType; value?: number }
export interface ArcadeSimulation<S extends ArcadeState = ArcadeState> {
  readonly state: S;
  /** One fixed tick. No DOM, real time, unseeded randomness, or rendering. */
  step(input: Readonly<ArcadeInput>): readonly GameSignal[];
}
export interface VisualOptions { reducedMotion: boolean; highContrast: boolean }
export interface ThreeStage {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  width: number;
  height: number;
}
export interface ArcadeView {
  update(alpha: number, options: VisualOptions): void;
  resize(width: number, height: number): void;
  dispose(): void;
  /** Optional pointer-to-aim mapping; normalized screen coordinates, up=-1. */
  aimAt?(x: number, y: number): { aimX: number; aimY: number };
}
export interface HudItem { label: string; value: string; kind?: "health" | "energy" | "combo" }
export interface GameDefinition {
  id: NewGameId;
  title: string;
  description: string;
  accent: string;
  controls: "drive" | "paddle" | "twin-stick" | "flippers";
  desktopInstructions: string;
  touchInstructions: string;
  primaryLabel: string;
  secondaryLabel: string;
  createSimulation(seed: number): ArcadeSimulation;
  createView(stage: ThreeStage, simulation: ArcadeSimulation): ArcadeView;
  hud(simulation: ArcadeSimulation): HudItem[];
}

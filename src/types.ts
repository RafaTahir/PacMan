export type Direction = "up" | "left" | "down" | "right";
export type Phase =
  | "title"
  | "ready"
  | "playing"
  | "dying"
  | "level-clear"
  | "game-over";
export type GhostId = "blinky" | "pinky" | "inky" | "clyde";
export type GhostMode = "normal" | "frightened" | "eyes" | "house" | "leaving";
export type FruitKind =
  | "cherry"
  | "strawberry"
  | "orange"
  | "apple"
  | "melon"
  | "galaxian"
  | "bell"
  | "key";
export interface Actor {
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
}
export interface Pacman extends Actor {
  nextDir: Direction;
}
export interface Ghost extends Actor {
  id: GhostId;
  mode: GhostMode;
  /** Frightened appearance also applies during house waiting and exit routes. */
  frightenedVisual?: boolean;
  target: { x: number; y: number };
}
export interface Fruit {
  x: number;
  y: number;
  kind: FruitKind;
  points: number;
  remaining: number;
}
export interface Popup {
  x: number;
  y: number;
  text: string;
  ttl: number;
}
export interface GameState {
  phase: Phase;
  paused: boolean;
  score: number;
  highScore: number;
  level: number;
  lives: number;
  time: number;
  phaseTime: number;
  frame: number;
  pellets: Set<number>;
  energizers: Set<number>;
  pacman: Pacman;
  ghosts: Ghost[];
  fruit: Fruit | null;
  fruitHistory: FruitKind[];
  frightenedRemaining: number;
  frightChain: number;
  mode: "scatter" | "chase";
  popups: Popup[];
  remaining: number;
  eaten: number;
}
export type GameEventType =
  | "start"
  | "ready"
  | "pellet"
  | "energizer"
  | "ghost"
  | "fruit"
  | "death"
  | "level"
  | "extra-life"
  | "game-over";
export interface GameEvent {
  type: GameEventType;
  value?: number;
}

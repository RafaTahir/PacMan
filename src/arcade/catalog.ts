import type { GameDefinition, GameId, NewGameId } from "./shared/contracts";
export const cabinets: { id: GameId; title: string; genre: string; copy: string; accent: string; number: string; glyph: string }[] = [
  { id: "pacman", title: "PAC-MAN", genre: "THE ORIGINAL CHASE", copy: "Four familiar rivals. One more round.", accent: "#ffe36c", number: "01", glyph: "◕" },
  { id: "neon-rally", title: "NEON RALLY", genre: "MIDNIGHT DRIFT", copy: "Find your line. Chase the close call.", accent: "#ff779c", number: "02", glyph: "↯" },
  { id: "reactor-breaker", title: "REACTOR BREAKER", genre: "CONTROLLED CHAOS", copy: "One perfect angle. A chain reaction.", accent: "#76e8e0", number: "03", glyph: "◈" },
  { id: "chrome-siege", title: "CHROME SIEGE", genre: "TWIN-STICK SURVIVAL", copy: "Hold the arena. Break the siege.", accent: "#bc9aff", number: "04", glyph: "✣" },
  { id: "midnight-pinball", title: "MIDNIGHT PINBALL", genre: "THE SILVER-BALL SHIFT", copy: "Light the table. Own the night.", accent: "#ffb56d", number: "05", glyph: "◎" },
];
const loaders: Record<NewGameId, () => Promise<{ default: GameDefinition }>> = {
  "neon-rally": () => import("./games/neon-rally"),
  "reactor-breaker": () => import("./games/reactor-breaker"),
  "chrome-siege": () => import("./games/chrome-siege"),
  "midnight-pinball": () => import("./games/midnight-pinball"),
};
export const loadGame = (id: NewGameId) => loaders[id]().then(module => module.default);

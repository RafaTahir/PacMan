import type { GameDefinition, GameId, NewGameId } from "./shared/contracts";
export const cabinets: { id: GameId; title: string; genre: string; copy: string; accent: string; number: string; glyph: string }[] = [
  { id: "pacman", title: "PAC-MAN", genre: "THE ORIGINAL CHASE", copy: "Four familiar rivals. One more round.", accent: "#ffe36c", number: "01", glyph: "◕" },
  { id: "neon-rally", title: "NEON RALLY", genre: "MIDNIGHT DRIFT", copy: "Find your line. Chase the close call.", accent: "#ff779c", number: "02", glyph: "↯" },
  { id: "reactor-breaker", title: "REACTOR BREAKER", genre: "CONTROLLED CHAOS", copy: "One perfect angle. A chain reaction.", accent: "#76e8e0", number: "03", glyph: "◈" },
  { id: "chrome-siege", title: "CHROME SIEGE", genre: "TWIN-STICK SURVIVAL", copy: "Hold the arena. Break the siege.", accent: "#bc9aff", number: "04", glyph: "✣" },
  { id: "midnight-pinball", title: "MIDNIGHT PINBALL", genre: "MALAYSIAN TROPICAL NIGHTS", copy: "Ride the river. Light the island.", accent: "#ffb56d", number: "05", glyph: "◎" },
  { id: "orbit-salvage", title: "ORBIT SALVAGE", genre: "DEEP SPACE RECOVERY", copy: "Break the rocks. Bring it home.", accent: "#8dcfff", number: "06", glyph: "✦" },
  { id: "tidal-courier", title: "TIDAL COURIER", genre: "ISLAND EXPRESS", copy: "Read the current. Make the delivery.", accent: "#61e6c0", number: "07", glyph: "≈" },
  { id: "prism-circuit", title: "PRISM CIRCUIT", genre: "LIGHT PATH PUZZLE", copy: "Turn a connection into a revelation.", accent: "#ff9cda", number: "08", glyph: "◇" },
  { id: "skybound-stack", title: "SKYBOUND STACK", genre: "FALLING BLOCK PUZZLE", copy: "Find the gap. Clear the skyline.", accent: "#ffcb77", number: "09", glyph: "▦" },
  { id: "canopy-sprint", title: "CANOPY SPRINT", genre: "TROPICAL TRAIL RUN", copy: "Above the palms. Ahead of trouble.", accent: "#b2e875", number: "10", glyph: "↟" },
];
const loaders: Record<NewGameId, () => Promise<{ default: GameDefinition }>> = {
  "neon-rally": () => import("./games/neon-rally"),
  "reactor-breaker": () => import("./games/reactor-breaker"),
  "chrome-siege": () => import("./games/chrome-siege"),
  "midnight-pinball": () => import("./games/midnight-pinball"),
  "orbit-salvage": () => import("./games/orbit-salvage"),
  "tidal-courier": () => import("./games/tidal-courier"),
  "prism-circuit": () => import("./games/prism-circuit"),
  "skybound-stack": () => import("./games/skybound-stack"),
  "canopy-sprint": () => import("./games/canopy-sprint"),
};
export const loadGame = (id: NewGameId) => loaders[id]().then(module => module.default);

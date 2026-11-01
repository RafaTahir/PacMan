import type { GameId } from "../src/arcade/shared/contracts";

/** Fixed table names, never request-derived. The original five games retain their
 * existing tables, rows, indexes and foreign keys; the added cabinets use a parallel set. */
export interface Store {
  readonly runs: string;
  readonly scores: string;
  readonly pendingExpiryIndex: string;
}
const addedGames: ReadonlySet<GameId> = new Set(["orbit-salvage", "tidal-courier", "prism-circuit", "skybound-stack", "canopy-sprint", "hollow-bureau"]);
export const isAdditionalCabinet = (game: GameId): boolean => addedGames.has(game);
export const legacyStore: Store = { runs: "runs", scores: "scores", pendingExpiryIndex: "runs_pending_expiry_idx" };
export const cabinetStore: Store = { runs: "cabinet_runs", scores: "cabinet_scores", pendingExpiryIndex: "cabinet_runs_pending_expiry_idx" };
export const storeForGame = (game: GameId): Store => (isAdditionalCabinet(game) ? cabinetStore : legacyStore);

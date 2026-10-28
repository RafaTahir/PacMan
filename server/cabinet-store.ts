import type { GameId } from "../src/arcade/shared/contracts";
import type { D1Database } from "./d1";

/** Fixed storage namespaces, never request-derived SQL identifiers. The original
 * five games retain their existing tables, rows, indexes and foreign keys. */
const addedGames: ReadonlySet<GameId> = new Set(["orbit-salvage", "tidal-courier", "prism-circuit", "skybound-stack", "canopy-sprint"]);
export const isAdditionalCabinet = (game: GameId): boolean => addedGames.has(game);
const stores = new WeakMap<D1Database, D1Database>();
export function additionalCabinetStore(db: D1Database): D1Database {
  const cached = stores.get(db); if (cached) return cached;
  const store: D1Database = {
    prepare(sql) {
      return db.prepare(sql.replace(/\bruns_pending_expiry_idx\b/g, "cabinet_runs_pending_expiry_idx")
        .replace(/\bruns\b/g, "cabinet_runs").replace(/\bscores\b/g, "cabinet_scores"));
    },
    batch(statements) { return db.batch(statements); },
  };
  stores.set(db, store); return store;
}
export const storeForGame = (db: D1Database, game: GameId): D1Database => isAdditionalCabinet(game) ? additionalCabinetStore(db) : db;

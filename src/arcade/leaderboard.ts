import { getBoard } from "./api";
import type { GameId } from "./shared/contracts";
export class Leaderboard {
  private serial = 0;
  private loading = false;
  private readonly timer: ReturnType<typeof setInterval>;
  private game = document.getElementById("leaderboard-game") as HTMLSelectElement;
  private scope = document.getElementById("leaderboard-scope") as HTMLSelectElement;
  private body = document.getElementById("leaderboard-body")!;
  private state = document.getElementById("leaderboard-state")!;
  private updated = document.getElementById("leaderboard-updated")!;
  constructor() {
    this.scope.value = "all";
    this.game.addEventListener("change", () => void this.refresh());
    this.scope.addEventListener("change", () => void this.refresh());
    document.getElementById("leaderboard-refresh")!.addEventListener("click", () => void this.refresh());
    this.timer = setInterval(() => {
      if (!document.hidden && !document.getElementById("arcade-home")!.hidden && !this.loading) void this.refresh(true);
    }, 15_000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !document.getElementById("arcade-home")!.hidden) void this.refresh(true);
    });
    void this.refresh();
  }
  select(game: GameId): void { this.game.value = game; void this.refresh(); }
  async refresh(quiet = false): Promise<void> {
    const serial = ++this.serial; this.loading = true;
    const table = this.body.closest("table")!;
    if (!quiet) { this.state.hidden = false; this.state.textContent = "Fetching the real high scores…"; table.hidden = true; }
    try {
      const board = await getBoard(this.game.value as GameId, this.scope.value as "all" | "daily");
      if (serial !== this.serial) return;
      this.body.replaceChildren();
      for (const entry of board.entries) {
        const row = document.createElement("tr");
        for (const value of [String(entry.rank).padStart(2, "0"), entry.initials, entry.score.toLocaleString()]) {
          const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
        }
        row.title = `Replay checked · ${new Date(entry.finishedAt).toLocaleString()}`;
        this.body.append(row);
      }
      table.hidden = board.entries.length === 0;
      this.state.hidden = board.entries.length > 0;
      this.state.textContent = "The board is open. Set the first real score.";
      this.state.dataset.state = board.entries.length ? "ready" : "empty";
      this.updated.textContent = `Updated ${new Date(board.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · refreshes every 15s`;
      this.updated.dataset.live = "true";
    } catch (error) {
      if (serial !== this.serial) return;
      table.hidden = true; this.state.hidden = false;
      this.state.textContent = error instanceof Error ? error.message : "Global scores are temporarily unavailable. Try refresh.";
      this.state.dataset.state = "error";
      this.updated.textContent = "Global rankings reconnect automatically. Local bests stay on your device.";
      this.updated.dataset.live = "false";
    } finally { if (serial === this.serial) this.loading = false; }
  }
  dispose(): void { clearInterval(this.timer); this.serial++; }
}

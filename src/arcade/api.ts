import { RULESET_VERSION, type GameId, type ReplayInput } from "./shared/contracts";
export interface RankedRun { runId: string; seed: number; game: GameId; ruleset: string; tickRate: number; maxTicks: number; expiresAt: string }
export interface BoardEntry { rank: number; initials: string; score: number; runId: string; finishedAt: string; verified: true }
export interface Board { game: GameId; scope: "all" | "daily"; entries: BoardEntry[]; updatedAt: string }
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal, credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options.headers } });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error?.message ?? "The score service is temporarily unavailable.", data?.error?.code ?? "unavailable", response.status);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("The score service could not be reached. Your local best is safe.", "network", 0);
  } finally { clearTimeout(timer); }
}
export const getBoard = (game: GameId, scope: "all" | "daily") => request<Board>(`/api/leaderboards?game=${game}&scope=${scope}&limit=10`);
export const issueRun = (game: GameId) => request<RankedRun>("/api/runs", { method: "POST", body: JSON.stringify({ game, ruleset: RULESET_VERSION }) });
export const submitRun = (run: RankedRun, initials: string, frames: number, inputs: ReplayInput[], score: number) =>
  request<{ accepted: true; entry: Omit<BoardEntry, "rank"> & { rank: number | null }; score: number; verified: true; replayed?: boolean }>(`/api/runs/${run.runId}/finish`, {
    method: "POST", body: JSON.stringify({ initials, frames, inputs, score }),
  });

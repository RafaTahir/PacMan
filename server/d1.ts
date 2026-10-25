/** Cloudflare D1's portable subset; also implemented by the integration adapter. */
export type SqlValue = string | number | null;
export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta: { changes?: number; [key: string]: unknown };
  error?: string;
}
export interface D1Statement {
  bind(...values: SqlValue[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
export interface D1Database {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}
export interface Env {
  DB?: D1Database;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** Optional override; otherwise the install-specific salt lives in D1. */
  RATE_LIMIT_SECRET?: string;
}
export function successful<T>(result: D1Result<T>): D1Result<T> {
  if (!result.success) throw new Error("D1 statement failed");
  return result;
}

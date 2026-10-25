import { ApiError } from "./errors";

// Exact three-letter public-label moderation. Labels are neither usernames nor
// proof of identity. Duplicate initials are allowed, including on one board.
const BLOCKED = new Set([
  "ASS", "CUM", "FAG", "FUK", "FUC", "FCK", "FUX", "KKK", "KYS", "NIG", "NGR", "SEX", "TIT", "WTF", "DCK", "DIK", "CNT", "COC", "COQ", "JIZ", "PUS", "SHT", "SOB", "WOP", "GYP", "KIK", "KKL", "NAZ",
]);
export function validateInitials(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw new ApiError(400, "invalid_initials", "Choose exactly three uppercase letters A–Z.");
  if (BLOCKED.has(value)) throw new ApiError(400, "blocked_initials", "Please choose different initials.");
  return value;
}

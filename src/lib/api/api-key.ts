import { timingSafeEqual } from "node:crypto";

export function apiKeyMatches(supplied: string | null, configured: string | undefined): boolean {
  if (!supplied || !configured) return false;
  const suppliedBytes = Buffer.from(supplied);
  const configuredBytes = Buffer.from(configured);
  return suppliedBytes.length === configuredBytes.length && timingSafeEqual(suppliedBytes, configuredBytes);
}

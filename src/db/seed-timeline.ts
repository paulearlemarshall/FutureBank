const DAY_MS = 86_400_000;

export function createSeedTimeline(now = new Date()) {
  const anchor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const instant = (days: number, hour = 9, minute = 0) => new Date(anchor + days * DAY_MS + hour * 3_600_000 + minute * 60_000);
  const date = (days: number) => instant(days, 0).toISOString().slice(0, 10);
  return { instant, date };
}

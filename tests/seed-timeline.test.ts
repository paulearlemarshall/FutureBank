import { describe, expect, it } from "vitest";
import { createSeedTimeline } from "@/db/seed-timeline";

describe("seed scenario timeline", () => {
  it("anchors relative scenario dates to the supplied UTC day", () => {
    const timeline = createSeedTimeline(new Date("2034-12-31T23:59:59.000Z"));
    expect(timeline.date(0)).toBe("2034-12-31");
    expect(timeline.date(1)).toBe("2035-01-01");
    expect(timeline.date(-1)).toBe("2034-12-30");
    expect(timeline.instant(2, 17).toISOString()).toBe("2035-01-02T17:00:00.000Z");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultFormSchema } from "./schemas";

const valid = { gameId: "g1", players: ["alice"], winnerIds: ["alice"] };

afterEach(() => vi.useRealTimers());

describe("ResultFormSchema date", () => {
  it("accepts today even in a tab left open for days", () => {
    // The schema module was loaded "days ago"; the clock has moved on since.
    const later = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    vi.useFakeTimers({ now: later, toFake: ["Date"] });
    expect(ResultFormSchema.safeParse({ ...valid, date: new Date() }).success).toBe(true);
  });

  it("rejects a date two days ahead", () => {
    const ahead = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    ahead.setHours(12);
    const result = ResultFormSchema.safeParse({ ...valid, date: ahead });
    expect(result.success).toBe(false);
  });
});

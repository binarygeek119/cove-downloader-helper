import { describe, expect, it } from "vitest";
import { describeOutcome } from "./outcome";

describe("describeOutcome", () => {
  it("summarizes queued sends with duplicates and failures", () => {
    expect(describeOutcome({ kind: "queued", jobIds: ["j"], queued: 1, issues: [] })).toEqual({
      text: "Sent to Cove",
      tone: "ok",
    });
    expect(
      describeOutcome({
        kind: "queued",
        jobIds: ["j"],
        queued: 3,
        issues: [
          { url: "a", kind: "duplicate", reason: "" },
          { url: "b", kind: "failed", reason: "" },
        ],
      }),
    ).toEqual({ text: "Sent 3 to Cove · 1 already in Cove · 1 failed", tone: "ok" });
  });

  it("treats an all-duplicate result as information, not an error", () => {
    expect(describeOutcome({ kind: "nothing-queued", issues: [{ url: "a", kind: "duplicate", reason: "x" }] })).toEqual(
      {
        text: "Already in Cove.",
        tone: "info",
      },
    );
    expect(
      describeOutcome({ kind: "nothing-queued", issues: [{ url: "a", kind: "unsupported", reason: "Nope." }] }),
    ).toEqual({
      text: "Nope.",
      tone: "error",
    });
  });

  it("describes pool, review, and error outcomes", () => {
    expect(describeOutcome({ kind: "pooled", added: 1, duplicates: 0, total: 4 })).toEqual({
      text: "Added to pool · 4 waiting",
      tone: "ok",
    });
    expect(describeOutcome({ kind: "pooled", added: 0, duplicates: 1, total: 4 })).toEqual({
      text: "Already in the pool.",
      tone: "info",
    });
    expect(describeOutcome({ kind: "needs-review", url: "x" }).tone).toBe("info");
    expect(describeOutcome({ kind: "error", message: "boom" })).toEqual({ text: "boom", tone: "error" });
  });
});

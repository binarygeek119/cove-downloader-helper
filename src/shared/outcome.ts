import type { SendOutcome } from "./models";

export interface OutcomeSummary {
  text: string;
  tone: "ok" | "info" | "error";
}

/** One line of user-facing text for a send result, shared by toasts and the panel. */
export function describeOutcome(outcome: SendOutcome): OutcomeSummary {
  switch (outcome.kind) {
    case "queued": {
      const parts = [outcome.queued === 1 ? "Sent to Cove" : `Sent ${outcome.queued} to Cove`];
      const duplicates = outcome.issues.filter(
        (issue) => issue.kind === "duplicate" || issue.kind === "in-flight",
      ).length;
      const failed = outcome.issues.length - duplicates;
      if (duplicates) parts.push(`${duplicates} already in Cove`);
      if (failed) parts.push(`${failed} failed`);
      return { text: parts.join(" · "), tone: "ok" };
    }
    case "nothing-queued": {
      const first = outcome.issues[0];
      if (!first) return { text: "Nothing to send.", tone: "error" };
      if (first.kind === "duplicate" || first.kind === "in-flight") {
        return {
          text: outcome.issues.length === 1 ? "Already in Cove." : "All of these are already in Cove.",
          tone: "info",
        };
      }
      return { text: first.reason, tone: "error" };
    }
    case "pooled":
      if (!outcome.added) return { text: "Already in the pool.", tone: "info" };
      return { text: `Added to pool · ${outcome.total} waiting`, tone: "ok" };
    case "needs-review":
      return { text: "Choose a match in the Cove panel.", tone: "info" };
    case "error":
      return { text: outcome.message, tone: "error" };
  }
}

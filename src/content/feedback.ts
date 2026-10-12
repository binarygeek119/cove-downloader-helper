/** Click handling with visible state. Buttons show busy, then done or error, and refuse double clicks. */
import { request } from "../shared/messaging";
import type { SendItem, SendOutcome, SendSource } from "../shared/models";
import { describeOutcome } from "../shared/outcome";
import { urlKey } from "../shared/url";

export type ButtonState = "idle" | "busy" | "done" | "error";

const DONE_HOLD_MS = 2500;
const ERROR_HOLD_MS = 3500;
const pending = new Set<string>();
const resetTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export function setButtonState(button: HTMLElement, state: ButtonState): void {
  button.dataset.state = state;
  if (button instanceof HTMLButtonElement) button.disabled = state === "busy";
  const timer = resetTimers.get(button);
  if (timer) clearTimeout(timer);
  if (state === "done" || state === "error") {
    resetTimers.set(
      button,
      setTimeout(
        () => {
          button.dataset.state = "idle";
        },
        state === "done" ? DONE_HOLD_MS : ERROR_HOLD_MS,
      ),
    );
  }
}

export interface SendOptions {
  button?: HTMLElement;
  toast: (text: string, error: boolean) => void;
}

/** Send one item and reflect the result on `button` and in a toast. Ignores a second click mid-flight. */
export async function sendWithFeedback(
  item: SendItem,
  source: SendSource,
  options: SendOptions,
): Promise<SendOutcome | null> {
  const key = urlKey(item.url);
  if (pending.has(key)) {
    options.toast("Already sending…", false);
    return null;
  }
  pending.add(key);
  if (options.button) setButtonState(options.button, "busy");
  let outcome: SendOutcome;
  try {
    outcome = await request("send", { items: [item], source });
  } catch (error) {
    outcome = { kind: "error", message: error instanceof Error ? error.message : String(error) };
  } finally {
    pending.delete(key);
  }
  const summary = describeOutcome(outcome);
  if (options.button) setButtonState(options.button, summary.tone === "error" ? "error" : "done");
  options.toast(summary.text, summary.tone === "error");
  return outcome;
}

export { describeOutcome };

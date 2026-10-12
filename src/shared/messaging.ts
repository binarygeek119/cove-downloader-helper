/**
 * Typed request/response contract between the panel or content scripts and the service worker,
 * plus the events the service worker broadcasts to open panels.
 */
import type { LayoutTarget } from "./layouts/types";
import type {
  ContentSettings,
  EromeSelectorState,
  JobFinished,
  PageVideo,
  PageVideosResult,
  PanelTab,
  PoolEntry,
  SendItem,
  SendOutcome,
  SendSource,
  TrackedJob,
} from "./models";

export interface MessageMap {
  /** The single entry point for every download. Handles pooling, dedupe, batching, and tracking. */
  send: {
    request: { items: SendItem[]; source: SendSource; tabId?: number };
    response: SendOutcome;
  };
  "pool:add": {
    request: { items: { url: string; title?: string; favicon?: string; thumbnail?: string }[]; tabId?: number };
    response: { added: number; duplicates: number; total: number };
  };
  "pool:list": { request: Record<string, never>; response: { entries: PoolEntry[] } };
  "pool:remove": { request: { keys: string[] }; response: { total: number } };
  "pool:clear": { request: Record<string, never>; response: { total: number } };
  "pool:send": { request: Record<string, never>; response: SendOutcome };
  "pool:export": { request: Record<string, never>; response: { saved: boolean } };
  "content:settings": { request: Record<string, never>; response: ContentSettings };
  "layout:targets": { request: { url: string }; response: { targets: LayoutTarget[] } };
  "page-videos:collect": { request: { tabId: number }; response: PageVideosResult };
  "erome:open-selector": { request: { albumUrl: string }; response: { token: number } };
  "erome:selector-ready": {
    request: { token: number; albumUrl: string; videos: PageVideo[]; error?: string };
    response: { accepted: boolean };
  };
  "permission:request": { request: Record<string, never>; response: { granted: boolean } };
  "permission:check": { request: Record<string, never>; response: { granted: boolean } };
  "tracked-jobs:list": { request: Record<string, never>; response: { jobs: TrackedJob[] } };
  "panel:open": { request: { tab?: PanelTab; windowId?: number }; response: { opened: boolean } };
}

export type MessageType = keyof MessageMap;

export interface RequestEnvelope<K extends MessageType = MessageType> {
  type: K;
  payload: MessageMap[K]["request"];
}

export type ResponseEnvelope<K extends MessageType = MessageType> =
  | { ok: true; data: MessageMap[K]["response"] }
  | { ok: false; error: string };

/** Fire-and-forget notifications from the service worker to any open panel. */
export type PanelEvent =
  | { kind: "show-tab"; tab: PanelTab }
  | { kind: "erome-selector"; state: EromeSelectorState }
  | { kind: "pool-changed"; total: number }
  | { kind: "send-result"; source: SendSource; outcome: SendOutcome }
  | { kind: "tracked-jobs-changed"; jobs: TrackedJob[] }
  | { kind: "job-finished"; result: JobFinished };

export interface EventEnvelope {
  type: "event";
  event: PanelEvent;
}

export function isRequestEnvelope(value: unknown): value is RequestEnvelope {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && type !== "event";
}

export function isEventEnvelope(value: unknown): value is EventEnvelope {
  return !!value && typeof value === "object" && (value as EventEnvelope).type === "event";
}

/** Send a typed request to the service worker and unwrap the response. Throws on failure. */
export async function request<K extends MessageType>(
  type: K,
  payload: MessageMap[K]["request"],
): Promise<MessageMap[K]["response"]> {
  const envelope: RequestEnvelope<K> = { type, payload };
  const response = (await chrome.runtime.sendMessage(envelope)) as ResponseEnvelope<K> | undefined;
  if (!response) throw new Error("The extension did not answer. Try reloading the page.");
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

/** Broadcast an event to every open panel. Nobody listening is not an error. */
export function broadcast(event: PanelEvent): void {
  const envelope: EventEnvelope = { type: "event", event };
  chrome.runtime.sendMessage(envelope).catch(() => {});
}

/** Listen for broadcast events. Returns an unsubscribe function. */
export function onEvent(listener: (event: PanelEvent) => void): () => void {
  const handler = (message: unknown) => {
    if (isEventEnvelope(message)) listener(message.event);
  };
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}

export type RequestHandlers = {
  [K in MessageType]: (
    payload: MessageMap[K]["request"],
    sender: chrome.runtime.MessageSender,
  ) => Promise<MessageMap[K]["response"]>;
};

/** Route incoming requests to typed handlers. Call once from the service worker. */
export function serveRequests(handlers: RequestHandlers): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isRequestEnvelope(message)) return false;
    const handler = handlers[message.type] as
      | ((payload: unknown, sender: chrome.runtime.MessageSender) => Promise<unknown>)
      | undefined;
    if (!handler) {
      sendResponse({ ok: false, error: `Unknown message: ${message.type}` });
      return false;
    }
    handler(message.payload, sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  });
}

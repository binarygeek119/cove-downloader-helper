import { useEffect, useRef } from "react";
import { onEvent, type PanelEvent } from "@/shared/messaging";

/** Subscribe to service-worker broadcasts for the lifetime of the component. */
export function usePanelEvents(handler: (event: PanelEvent) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  }, [handler]);
  useEffect(() => onEvent((event) => ref.current(event)), []);
}

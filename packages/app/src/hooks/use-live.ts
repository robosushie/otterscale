import { useEffect } from "react";

export function useLive<T>(topic: "machines" | "workspaces" | "users", apply: (data: T) => void) {
  useEffect(() => {
    const source = new EventSource("/api/live");
    const onEvent = (event: Event) => {
      try {
        apply(JSON.parse((event as MessageEvent).data) as T);
      } catch {
        /* ignore malformed frames */
      }
    };
    source.addEventListener(topic, onEvent);
    return () => {
      source.removeEventListener(topic, onEvent);
      source.close();
    };
  }, [topic, apply]);
}

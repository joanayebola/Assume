"use client";

import type { ClientEventName, EventProps } from "./events";

/**
 * Browser → /api/analytics → provider. The server re-validates every event
 * against its allow-list; nothing is sent to a third party from the browser.
 * The visit id lives in sessionStorage only (gone when the tab closes).
 */

function visitId() {
  try {
    let id = sessionStorage.getItem("assume:visit");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("assume:visit", id);
    }
    return id;
  } catch {
    return null;
  }
}

export function trackClient<E extends ClientEventName>(event: E, props: EventProps<E>) {
  try {
    const body = JSON.stringify({ event, props, visit: visitId() });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/analytics", blob)) {
      void fetch("/api/analytics", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // Analytics must never break the page.
  }
}

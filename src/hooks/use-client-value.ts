"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * A value that only exists in the browser (device timezone, localStorage…).
 * Renders `serverValue` on the server and during hydration, then the real
 * value — without a setState-in-effect round trip.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noop, read, () => serverValue);
}

/** Current time, rounded down to the minute, ticking every minute. null on the server. */
export function useMinute(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const t = setInterval(onChange, 15_000);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => null,
  );
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode) — the in-memory state still applies.
  }
}

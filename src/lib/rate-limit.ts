import "server-only";

/**
 * Best-effort, per-instance fixed-window limiter for cheap endpoints
 * (analytics, contact). Expensive or money-related paths — Gemini generation
 * and checkout creation — are limited by counting rows in the database
 * instead, which holds across serverless instances.
 */

const windows = new Map<string, { count: number; resetAt: number }>();

export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    if (windows.size > 10_000) windows.clear(); // bound memory
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  w.count += 1;
  return w.count <= limit;
}

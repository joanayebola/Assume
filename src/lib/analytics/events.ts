import { z } from "zod";

import { STEP_KEYS } from "@/lib/intake/model";

/**
 * Every analytics event and exactly which properties it may carry.
 *
 * Properties are enums, numbers and booleans only — there is deliberately no
 * way to attach free text, so manifestation, circumstance or affirmation text
 * can't reach an analytics provider even by accident. Unknown properties are
 * stripped; invalid ones drop the event.
 */

const code = z.string().regex(/^[a-z_]{1,40}$/);
const kind = z.enum(["initial", "adjust", "regenerate_session"]);

export const EVENTS = {
  landing_cta_clicked: z.object({ location: z.enum(["hero", "header", "mobile_menu", "how_it_works", "final", "pricing"]) }),
  signup_completed: z.object({}),
  intake_started: z.object({}),
  intake_step_completed: z.object({ step: z.enum(STEP_KEYS) }),
  intake_completed: z.object({}),
  generation_started: z.object({ kind }),
  generation_succeeded: z.object({ kind, attempts: z.number().int().min(0).max(10).optional() }),
  generation_failed: z.object({ kind, code }),
  checkout_started: z.object({ product: z.enum(["routine", "unlimited"]) }),
  purchase_completed: z.object({ product: z.enum(["routine", "unlimited"]) }),
  plan_viewed: z.object({}),
  plan_edited: z.object({ op: code }),
  routine_exported: z.object({ provider: z.enum(["ics", "google"]), events: z.number().int().min(0).max(60), single: z.boolean() }),
  calendar_connected: z.object({ provider: z.enum(["google"]) }),
  manifestation_completed: z.object({}),
} as const;

export type EventName = keyof typeof EVENTS;
export type EventProps<E extends EventName> = z.input<(typeof EVENTS)[E]>;

/** Events the browser may send through /api/analytics. Everything else is server-side only. */
export const CLIENT_EVENTS = ["landing_cta_clicked", "intake_step_completed"] as const satisfies readonly EventName[];
export type ClientEventName = (typeof CLIENT_EVENTS)[number];

export function validateProps<E extends EventName>(event: E, props: unknown): Record<string, string | number | boolean> | null {
  const parsed = EVENTS[event].safeParse(props ?? {});
  return parsed.success ? (parsed.data as Record<string, string | number | boolean>) : null;
}

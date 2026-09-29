import { z } from "zod";

import { isValidTimeZone } from "@/lib/calendar/zoned";
import { TECHNIQUES } from "@/lib/intake/model";

import { sortSessions } from "./build";
import { newId, recurrenceFor, sessionSchema, weekdaySchema, type PlanDoc, type Session } from "./schema";

/**
 * User edits, expressed as small operations applied to the *current* stored
 * plan on the server (never a whole document from the client). That keeps
 * concurrent tabs from clobbering each other and keeps validation central.
 * Every edited or added session is marked `userEdited`, so AI adjustments
 * leave it alone by default.
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use a time like 07:30." });

export const sessionInputSchema = z.object({
  title: z.string().trim().min(1, { error: "Give it a name." }).max(80, { error: "Keep it under 80 characters." }),
  technique: z.enum(TECHNIQUES),
  customTechniqueLabel: z.string().trim().max(80),
  days: z.array(weekdaySchema).min(1, { error: "Pick at least one day." }).max(7),
  startTime: hhmm,
  durationMinutes: z.number({ error: "How many minutes?" }).int().min(1, { error: "At least a minute." }).max(180, { error: "Keep it under 3 hours." }),
  flexibleTiming: z.boolean(),
  optional: z.boolean(),
  instructions: z.string().trim().min(1, { error: "Add a short instruction." }).max(1200),
  affirmationIds: z.array(z.string()).max(12),
  askfirmationIds: z.array(z.string()).max(12),
  visualizationPrompt: z.string().trim().max(1200),
  scriptingPrompt: z.string().trim().max(1200),
  notes: z.string().trim().max(600),
});
export type SessionInput = z.infer<typeof sessionInputSchema>;

const libraryKind = z.enum(["affirmation", "askfirmation"]);
const libraryText = z.string().trim().min(1, { error: "Write something first." }).max(500, { error: "Keep it under 500 characters." });

export const editOpSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update_session"), id: z.string(), session: sessionInputSchema }),
  z.object({ type: z.literal("add_session"), session: sessionInputSchema }),
  z.object({ type: z.literal("remove_session"), id: z.string() }),
  z.object({ type: z.literal("duplicate_session"), id: z.string() }),
  z.object({ type: z.literal("add_library_item"), kind: libraryKind, text: libraryText }),
  z.object({ type: z.literal("update_library_item"), kind: libraryKind, id: z.string(), text: libraryText }),
  z.object({ type: z.literal("remove_library_item"), kind: libraryKind, id: z.string() }),
  z.object({
    type: z.literal("set_timezone"),
    timezone: z.string().min(1).max(64).refine(isValidTimeZone, { error: "Choose a timezone from the list." }),
  }),
]);
export type EditOp = z.infer<typeof editOpSchema>;

export class EditError extends Error {}

function sessionFrom(input: SessionInput, base: Pick<Session, "id" | "manifestationId" | "contextActivity" | "fitReason" | "origin">): Session {
  const days = [...new Set(input.days)].sort((a, b) => a - b);
  return sessionSchema.parse({
    ...base,
    ...input,
    customTechniqueLabel: input.technique === "other" ? input.customTechniqueLabel : "",
    days,
    recurrence: recurrenceFor(days),
    userEdited: true,
  });
}

export function applyEdit(doc: PlanDoc, op: EditOp): { doc: PlanDoc; summary: string } {
  const find = (id: string) => {
    const s = doc.sessions.find((x) => x.id === id);
    if (!s) throw new EditError("That session no longer exists.");
    return s;
  };
  const listKey = (k: "affirmation" | "askfirmation") => (k === "affirmation" ? "affirmations" : "askfirmations");
  const idsKey = (k: "affirmation" | "askfirmation") => (k === "affirmation" ? "affirmationIds" : "askfirmationIds");

  switch (op.type) {
    case "update_session": {
      const current = find(op.id);
      const next = sessionFrom(op.session, current);
      return {
        doc: { ...doc, sessions: sortSessions(doc.sessions.map((s) => (s.id === op.id ? next : s))) },
        summary: `Edited “${next.title}”`,
      };
    }
    case "add_session": {
      if (doc.sessions.length >= 60) throw new EditError("That's the most sessions a routine can have.");
      const next = sessionFrom(op.session, {
        id: newId("s"),
        manifestationId: doc.manifestation.id,
        contextActivity: "",
        fitReason: "",
        origin: "custom",
      });
      return { doc: { ...doc, sessions: sortSessions([...doc.sessions, next]) }, summary: `Added “${next.title}”` };
    }
    case "remove_session": {
      const s = find(op.id);
      return { doc: { ...doc, sessions: doc.sessions.filter((x) => x.id !== op.id) }, summary: `Removed “${s.title}”` };
    }
    case "duplicate_session": {
      if (doc.sessions.length >= 60) throw new EditError("That's the most sessions a routine can have.");
      const s = find(op.id);
      const copy: Session = { ...s, id: newId("s"), title: `${s.title} (copy)`.slice(0, 80), userEdited: true, origin: "custom" };
      return { doc: { ...doc, sessions: sortSessions([...doc.sessions, copy]) }, summary: `Duplicated “${s.title}”` };
    }
    case "add_library_item": {
      const key = listKey(op.kind);
      const text = op.kind === "askfirmation" && !/[?？]$/.test(op.text) ? `${op.text}?` : op.text;
      if (doc[key].length >= (key === "affirmations" ? 40 : 20)) throw new EditError("That list is full.");
      return {
        doc: { ...doc, [key]: [...doc[key], { id: newId(op.kind === "affirmation" ? "a" : "q"), text, source: "custom" }] },
        summary: op.kind === "affirmation" ? "Added an affirmation" : "Added an askfirmation",
      };
    }
    case "update_library_item": {
      const key = listKey(op.kind);
      if (!doc[key].some((a) => a.id === op.id)) throw new EditError("That item no longer exists.");
      return {
        doc: { ...doc, [key]: doc[key].map((a) => (a.id === op.id ? { ...a, text: op.text } : a)) },
        summary: op.kind === "affirmation" ? "Edited an affirmation" : "Edited an askfirmation",
      };
    }
    case "set_timezone": {
      // Sessions keep their wall-clock times; they now happen in the new zone.
      return { doc: { ...doc, timezone: op.timezone }, summary: `Moved to ${op.timezone.replace(/_/g, " ")} time` };
    }
    case "remove_library_item": {
      const key = listKey(op.kind);
      const ids = idsKey(op.kind);
      return {
        doc: {
          ...doc,
          [key]: doc[key].filter((a) => a.id !== op.id),
          sessions: doc.sessions.map((s) => ({ ...s, [ids]: s[ids].filter((x) => x !== op.id) })),
        },
        summary: op.kind === "affirmation" ? "Removed an affirmation" : "Removed an askfirmation",
      };
    }
  }
}

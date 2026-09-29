"use client";

import { ArrowUpRight, CalendarCheck2, CalendarPlus, Check, Download, Lock, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { ChoiceCard, Segmented } from "@/components/intake/controls";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { controlClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { prepareIcsExport, saveCalendarPreferences, syncGoogleCalendar } from "@/lib/actions/calendar";
import { dayMonth, shortDate, zoneCity } from "@/lib/calendar/format";
import {
  buildEvents,
  describeExportRecurrence,
  describeRecurrence,
  exportOptionsSchema,
  firstOccurrenceDate,
  titleStyleLabels,
  TITLE_STYLES,
  type CalendarPreferences,
  type CalendarProvider,
  type ExportOptions,
} from "@/lib/calendar/model";
import { zoneAbbreviation } from "@/lib/calendar/zoned";
import { formatClock } from "@/lib/intake/format";
import type { PlanDoc } from "@/lib/plan/schema";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

import type { CalendarContext } from "./types";

type Done = { provider: "ics"; url: string; count: number } | { provider: "google"; count: number; calendarName: string };

const DETAIL_OPTIONS: { key: keyof CalendarPreferences["include"]; label: string; hint: string }[] = [
  { key: "instructions", label: "How to do it", hint: "The session's instructions" },
  { key: "affirmations", label: "Affirmations", hint: "The exact words, as a list" },
  { key: "visualization", label: "Visualization scene", hint: "The scene to picture" },
  { key: "link", label: "Link back to Assume", hint: "Opens this routine" },
];

const REMINDERS: { value: string; label: string }[] = [
  { value: "none", label: "No reminder" },
  { value: "0", label: "When it starts" },
  { value: "5", label: "5 minutes before" },
  { value: "10", label: "10 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
];

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      {aside}
    </div>
  );
}

/** Compact checkbox row with a 48px tap target. */
function CheckRow({
  checked,
  onChange,
  children,
  muted,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <label
      className={cn(
        "group flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2.5 select-none hover:bg-ink/[0.03]",
        "has-focus-visible:outline-3 has-focus-visible:-outline-offset-3 has-focus-visible:outline-ink",
        muted && "opacity-60",
      )}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-xs border-2 border-ink bg-background peer-checked:bg-ink peer-checked:text-accent"
      >
        <Check className="size-3.5 scale-0 transition-transform duration-150 group-has-checked:scale-100" strokeWidth={3.5} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function initialOptions(ctx: CalendarContext, provider: CalendarProvider, doc: PlanDoc, onlySessionId?: string): ExportOptions {
  if (onlySessionId) {
    return {
      excludedSessionIds: doc.sessions.filter((s) => s.id !== onlySessionId).map((s) => s.id),
      startDate: ctx.planToday,
      endDate: null,
      preferences: ctx.preferences,
    };
  }
  const previous = ctx.exports[provider]?.options;
  if (!previous) return { excludedSessionIds: [], startDate: ctx.planToday, endDate: null, preferences: ctx.preferences };
  // Google updates keep their original start so past events stay put; a new file starts today.
  const startDate = provider === "google" ? previous.startDate : ctx.planToday;
  const endDate = previous.endDate && previous.endDate < startDate ? null : previous.endDate;
  return { ...previous, startDate, endDate };
}

export function ExportSheet({
  open,
  onClose,
  doc,
  ctx,
  initialProvider,
  onlySessionId,
  onGoogleDone,
}: {
  open: boolean;
  onClose: () => void;
  doc: PlanDoc;
  ctx: CalendarContext;
  initialProvider?: CalendarProvider;
  /** Individual export: just this session, as an .ics file. */
  onlySessionId?: string;
  onGoogleDone?: () => void;
}) {
  const single = Boolean(onlySessionId);
  const [provider, setProvider] = useState<CalendarProvider>(
    single || !ctx.googleAvailable ? "ics" : (initialProvider ?? (ctx.exports.google ? "google" : "ics")),
  );
  const [options, setOptions] = useState<ExportOptions>(() => initialOptions(ctx, provider, doc, onlySessionId));
  const [rememberPrivacy, setRememberPrivacy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reconnect?: boolean } | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const switchProvider = (p: CalendarProvider) => {
    setProvider(p);
    setOptions(initialOptions(ctx, p, doc, onlySessionId));
    setError(null);
  };

  const prefs = options.preferences;
  const setPrefs = (patch: Partial<CalendarPreferences>) => setOptions((o) => ({ ...o, preferences: { ...o.preferences, ...patch } }));
  const excluded = new Set(options.excludedSessionIds);
  const toggleSession = (id: string) =>
    setOptions((o) => ({
      ...o,
      excludedSessionIds: excluded.has(id) ? o.excludedSessionIds.filter((x) => x !== id) : [...o.excludedSessionIds, id],
    }));

  const events = useMemo(() => buildEvents(doc, { planId: ctx.planId, options, siteUrl: ctx.siteUrl }), [doc, ctx.planId, ctx.siteUrl, options]);
  const validation = exportOptionsSchema.safeParse(options);
  const problem = !validation.success
    ? validation.error.issues[0]?.message
    : events.length === 0
      ? options.excludedSessionIds.length === doc.sessions.length
        ? "Choose at least one session."
        : "None of the chosen sessions happen between those dates."
      : null;

  const previous = single ? null : ctx.exports[provider];
  const googleReady = ctx.google.connected && !ctx.google.needsReconnect;
  const needsConnect = provider === "google" && !googleReady;
  const tzLabel = `${zoneCity(doc.timezone)} time (${zoneAbbreviation(doc.timezone)})`;
  const sample = events[0];
  const sessions = [...doc.sessions].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const connectHref = `${routes.googleConnect}?next=${encodeURIComponent(`${routes.plans}/${ctx.planId}?export=google`)}`;

  async function submit() {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (rememberPrivacy && !single) void saveCalendarPreferences(prefs);
      if (provider === "ics") {
        const r = await prepareIcsExport(ctx.planId, options, !single);
        if (!r.ok) return setError({ message: r.message });
        window.location.assign(r.url);
        setDone({ provider: "ics", url: r.url, count: r.eventCount });
      } else {
        const r = await syncGoogleCalendar(ctx.planId, options);
        if (!r.ok) return setError({ message: r.message, reconnect: r.code === "reconnect" });
        setDone({ provider: "google", count: r.result.eventCount, calendarName: r.result.calendarName });
        onGoogleDone?.();
      }
    } catch {
      setError({ message: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- done ----
  if (done) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={done.provider === "ics" ? "Your calendar file is ready" : "It's in your calendar"}
        footer={
          <Button onClick={onClose} block className="sm:w-auto">
            Done
          </Button>
        }
      >
        <div className="animate-pop space-y-5">
          <div className="flex items-center gap-4 rounded-lg border-2 border-ink bg-accent p-4 shadow-hard-sm">
            <span className="grid size-12 shrink-0 place-items-center rounded-md border-2 border-ink bg-surface">
              <CalendarCheck2 className="size-6" aria-hidden />
            </span>
            <p className="font-display text-xl font-bold leading-tight">
              {done.count} {done.count === 1 ? "event" : "events"}
              {done.provider === "google" ? ` in your “${done.calendarName}” calendar.` : " in one file."}
            </p>
          </div>

          {done.provider === "ics" ? (
            <>
              <p className="leading-relaxed">
                Your download should have started.{" "}
                <a href={done.url} className="font-semibold underline decoration-2 underline-offset-4">
                  Download again
                </a>
              </p>
              <dl className="divide-y-2 divide-ink/10 rounded-lg border-2 border-ink bg-surface text-sm">
                {[
                  ["iPhone or iPad", "Tap the file, then “Add All”."],
                  ["Mac", "Open the file. Calendar asks which calendar to add it to."],
                  ["Google Calendar", "On a computer: Settings → Import & export → Import."],
                  ["Outlook", "Add calendar → Upload from file."],
                ].map(([k, v]) => (
                  <div key={k} className="grid gap-0.5 p-3 sm:grid-cols-[9rem_1fr] sm:gap-3">
                    <dt className="font-semibold">{k}</dt>
                    <dd className="text-muted-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Calendar apps can&apos;t update events imported from a file. If you change this routine, Assume will let you know
                and give you a fresh file.
              </p>
            </>
          ) : (
            <>
              <p className="leading-relaxed">
                When you change this routine, Assume will offer to update these events — they&apos;re edited in place, never
                duplicated.
              </p>
              <a
                href="https://calendar.google.com/calendar/r"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold underline decoration-2 underline-offset-4"
              >
                Open Google Calendar <ArrowUpRight className="size-4" aria-hidden />
              </a>
            </>
          )}
        </div>
      </Dialog>
    );
  }

  // ---------------------------------------------------------------- form ----
  const actionLabel =
    provider === "ics"
      ? `Download ${events.length} ${events.length === 1 ? "event" : "events"}`
      : previous
        ? "Update Google Calendar"
        : `Add ${events.length} ${events.length === 1 ? "event" : "events"} to Google`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={single ? "Add this session to your calendar" : "Add routine to calendar"}
      description={single ? "One repeating event, as a calendar file." : "Pick what goes in, and how private it looks."}
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {problem ? (
              <span className="font-medium text-destructive">{problem}</span>
            ) : (
              <>
                <span className="font-semibold text-ink">
                  {events.length} {events.length === 1 ? "event" : "events"}
                </span>{" "}
                · {describeExportRecurrence(events)} · from {shortDate(options.startDate)}
                {options.endDate ? ` to ${shortDate(options.endDate)}` : ""}
              </>
            )}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {needsConnect ? (
              <a href={connectHref} className={buttonClasses({ variant: "primary" })}>
                <CalendarPlus aria-hidden />
                {ctx.google.needsReconnect ? "Reconnect Google" : "Connect Google Calendar"}
              </a>
            ) : (
              <Button
                onClick={submit}
                disabled={Boolean(problem)}
                loading={busy}
                loadingText={provider === "ics" ? "Preparing…" : "Saving to Google…"}
                iconLeft={provider === "ics" ? <Download aria-hidden /> : previous ? <RefreshCw aria-hidden /> : <CalendarPlus aria-hidden />}
              >
                {actionLabel}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-8">
        {/* Where ------------------------------------------------------------- */}
        {!single && ctx.googleAvailable && (
          <section>
            <SectionTitle>Calendar</SectionTitle>
            <Segmented
              name="provider"
              ariaLabel="Calendar"
              value={provider}
              onChange={switchProvider}
              className="flex w-full [&>label]:flex-1"
              options={[
                { value: "ics", label: "Apple & others" },
                { value: "google", label: "Google" },
              ]}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              {provider === "ics"
                ? "A calendar file (.ics) that works with Apple Calendar, Outlook and most apps."
                : "Adds events straight to Google Calendar and keeps them up to date."}
            </p>
          </section>
        )}

        {needsConnect && (
          <div className="rounded-lg border-2 border-ink bg-surface p-4">
            <p className="flex items-center gap-2 font-semibold">
              <Lock className="size-4" aria-hidden />
              {ctx.google.needsReconnect ? "Google Calendar needs reconnecting" : "Connect Google Calendar first"}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Assume creates its own calendar called “Assume” and only ever touches that one. It can&apos;t see or change any of
              your other events.
            </p>
          </div>
        )}

        {/* Warnings about earlier exports --------------------------------------- */}
        {previous && provider === "ics" && (
          <Notice
            tone="info"
            title={previous.state === "out_of_date" ? "Your routine changed since your last file" : "You've already added this routine"}
          >
            {previous.state === "out_of_date"
              ? `Assume can't change events you imported on ${dayMonth(previous.lastExportedAt, ctx.viewerTimeZone)}. Delete those events in your calendar app first, then import this file — otherwise you'll see both.`
              : `You downloaded it on ${dayMonth(previous.lastExportedAt, ctx.viewerTimeZone)}. Importing it again will add a second copy in most calendar apps.`}
          </Notice>
        )}
        {previous && provider === "google" && googleReady && (
          <p className="flex items-start gap-2 rounded-md bg-surface p-3 text-sm">
            <RefreshCw className="mt-0.5 size-4 shrink-0" aria-hidden />
            Already in Google Calendar. Saving updates those events in place — nothing is duplicated.
          </p>
        )}

        {/* Sessions -------------------------------------------------------------- */}
        {!single && (
          <section>
            <SectionTitle
              aside={
                <button
                  type="button"
                  className="min-h-9 rounded-sm px-1 text-sm font-semibold underline decoration-2 underline-offset-4"
                  onClick={() =>
                    setOptions((o) => ({ ...o, excludedSessionIds: o.excludedSessionIds.length ? [] : doc.sessions.map((s) => s.id) }))
                  }
                >
                  {options.excludedSessionIds.length ? "Select all" : "Select none"}
                </button>
              }
            >
              Sessions
            </SectionTitle>
            <div className="divide-y-2 divide-ink/10 overflow-hidden rounded-lg border-2 border-ink bg-surface">
              {sessions.map((s) => {
                const inRange = firstOccurrenceDate(s.days, options.startDate, options.endDate) !== null;
                return (
                  <CheckRow key={s.id} checked={!excluded.has(s.id)} onChange={() => toggleSession(s.id)} muted={!inRange}>
                    <span className="flex items-baseline gap-3">
                      <span className="w-16 shrink-0 font-mono text-sm font-bold tabular-nums">{formatClock(s.startTime)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{s.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {describeRecurrence({ byDay: [...s.days].sort((a, b) => a - b) })} · {s.durationMinutes} min
                          {!inRange && " · not in these dates"}
                        </span>
                      </span>
                    </span>
                  </CheckRow>
                );
              })}
            </div>
          </section>
        )}

        {/* Dates ------------------------------------------------------------------ */}
        <section>
          <SectionTitle>Dates</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Starts</span>
              <input
                type="date"
                value={options.startDate}
                onChange={(e) => e.target.value && setOptions((o) => ({ ...o, startDate: e.target.value }))}
                className={cn(controlClasses, "h-12")}
              />
            </label>
            <div className="space-y-2">
              <span className="block text-sm font-semibold">Ends</span>
              {options.endDate === null ? (
                <button
                  type="button"
                  onClick={() => setOptions((o) => ({ ...o, endDate: shiftMonths(o.startDate, 3) }))}
                  className={cn(controlClasses, "flex h-12 items-center justify-between text-left")}
                >
                  <span>Keeps repeating</span>
                  <span className="text-sm font-semibold underline decoration-2 underline-offset-4">Set end date</span>
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={options.endDate}
                    min={options.startDate}
                    onChange={(e) => setOptions((o) => ({ ...o, endDate: e.target.value || null }))}
                    aria-label="End date"
                    className={cn(controlClasses, "h-12 min-w-0 flex-1")}
                  />
                  <Button variant="secondary" className="h-12" onClick={() => setOptions((o) => ({ ...o, endDate: null }))}>
                    No end
                  </Button>
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Times are in {tzLabel}. Your calendar shows them in whatever timezone you&apos;re in.
          </p>
        </section>

        {/* Privacy ------------------------------------------------------------------ */}
        <section>
          <SectionTitle>How events look</SectionTitle>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Event title</legend>
            {TITLE_STYLES.map((style) => (
              <ChoiceCard
                key={style}
                name="title-style"
                value={style}
                size="sm"
                checked={prefs.titleStyle === style}
                onChange={() => setPrefs({ titleStyle: style })}
                label={titleStyleLabels[style].label}
                description={
                  style === "descriptive" ? `“${sample ? sample.internal.sessionTitle : "Morning affirmations"}”` : style === "custom" ? titleStyleLabels[style].hint : `“${titleStyleLabels[style].example("")}”`
                }
              />
            ))}
          </fieldset>
          {prefs.titleStyle === "custom" && (
            <label className="mt-3 block space-y-2 animate-rise">
              <span className="text-sm font-semibold">Your title</span>
              <input
                value={prefs.customTitle}
                onChange={(e) => setPrefs({ customTitle: e.target.value })}
                maxLength={80}
                placeholder="e.g. Me time"
                autoFocus
                className={cn(controlClasses, "h-12")}
              />
            </label>
          )}

          <fieldset className="mt-6">
            <legend className="mb-2 text-sm font-semibold">Put in the event description</legend>
            <div className="divide-y-2 divide-ink/10 overflow-hidden rounded-lg border-2 border-ink bg-surface">
              {DETAIL_OPTIONS.map((d) => (
                <CheckRow key={d.key} checked={prefs.include[d.key]} onChange={() => setPrefs({ include: { ...prefs.include, [d.key]: !prefs.include[d.key] } })}>
                  <span className="block font-semibold">{d.label}</span>
                  <span className="block text-xs text-muted-foreground">{d.hint}</span>
                </CheckRow>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Anyone who can see your calendar — on a lock screen, a shared or work calendar — may see these.
            </p>
          </fieldset>

          {sample && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold">Preview</p>
              <div className="rounded-md border-2 border-ink bg-background p-3 shadow-hard-xs">
                <p className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-bold tabular-nums">{formatClock(sample.start.time)}</span>
                  <span className="font-semibold">{sample.title}</span>
                </p>
                {sample.description ? (
                  <p className="mt-2 line-clamp-6 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">
                    {sample.description}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">No description.</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Reminder -------------------------------------------------------------------- */}
        <section>
          <SectionTitle>Reminder</SectionTitle>
          <div className="relative">
            <select
              value={prefs.reminderMinutes === null ? "none" : String(prefs.reminderMinutes)}
              onChange={(e) => setPrefs({ reminderMinutes: e.target.value === "none" ? null : Number(e.target.value) })}
              aria-label="Reminder"
              className={cn(controlClasses, "h-12 appearance-none pr-11")}
            >
              {REMINDERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2">
              <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" />
            </svg>
          </div>
        </section>

        {!single && (
          <CheckRow checked={rememberPrivacy} onChange={() => setRememberPrivacy((v) => !v)}>
            <span className="text-sm font-semibold">Use these choices next time</span>
          </CheckRow>
        )}

        {error && (
          <Notice tone="error" title={error.reconnect ? "Reconnect Google Calendar" : undefined}>
            {error.message}
            {error.reconnect && (
              <a href={connectHref} className="mt-2 inline-block font-semibold underline decoration-2 underline-offset-4">
                Reconnect now
              </a>
            )}
          </Notice>
        )}
      </div>
    </Dialog>
  );
}

function shiftMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, d));
  return t.toISOString().slice(0, 10);
}

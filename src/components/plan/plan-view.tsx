"use client";

import { ArrowRight, CalendarCheck2, CalendarPlus, Globe, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ExportSheet } from "@/components/calendar/export-sheet";
import { PlanCalendarPanel } from "@/components/calendar/plan-calendar-panel";
import type { CalendarContext } from "@/components/calendar/types";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { requestSessionRegeneration } from "@/lib/actions/plan";
import type { GenerationStatusResponse } from "@/lib/generation/present";
import type { Weekday } from "@/lib/intake/model";
import type { PlanDoc } from "@/lib/plan/schema";
import { zoneAbbreviation, zoneCity } from "@/lib/calendar/zoned";
import type { PlanStatus, RequestStatus, VersionSummary } from "@/lib/plan/store";
import { dailyEstimate, dayMinutes, formatMinutes, sessionsOn, WEEK } from "@/lib/plan/view";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

import { AdjustDialog } from "./adjust-dialog";
import { LibraryEditor } from "./library-editor";
import { LifecycleBanner, PlanLifecycle } from "./plan-lifecycle";
import { SessionCard, type RegenState } from "./session-card";
import { TimezoneDialog } from "./timezone-dialog";
import { blankSession, SessionEditor, toInput } from "./session-editor";
import { Toast } from "./toast";
import { usePlan } from "./use-plan";
import { VersionHistory } from "./version-history";
import { DayStrip, WeekGrid } from "./week-view";

type View = "today" | "week";
type Editor = { mode: "edit"; sessionId: string } | { mode: "add" } | null;
type Exporting = { provider?: "ics" | "google"; sessionId?: string } | null;

const CALENDAR_FLAGS: Record<string, { tone: "success" | "error"; message: string }> = {
  connected: { tone: "success", message: "Google Calendar connected." },
  denied: { tone: "error", message: "Google Calendar wasn't connected. You can still download a calendar file." },
  scope: { tone: "error", message: "Assume needs permission to manage its own calendar. Try again and leave that box ticked." },
  expired: { tone: "error", message: "That took a little long. Please connect again." },
  unavailable: { tone: "error", message: "Google Calendar isn't switched on here yet. A calendar file works everywhere." },
  error: { tone: "error", message: "Google didn't respond as expected. Please try again." },
};

/** Follow a single-session regeneration until it finishes. */
function useRegeneration(onDone: () => void) {
  const [regens, setRegens] = useState<Record<string, RegenState>>({});
  const timers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    const all = timers.current;
    return () => Object.values(all).forEach(clearInterval);
  }, []);

  const follow = useCallback(
    (sessionId: string, requestId: string) => {
      setRegens((r) => ({ ...r, [sessionId]: { status: "working" } }));
      let ticks = 0;
      clearInterval(timers.current[sessionId]);
      timers.current[sessionId] = setInterval(async () => {
        ticks += 1;
        try {
          const method = ticks === 3 || ticks % 10 === 0 ? "POST" : "GET";
          const res = await fetch(`/api/generation/${requestId}`, { method, cache: "no-store" });
          if (!res.ok) return;
          const s = (await res.json()) as GenerationStatusResponse;
          if (s.status === "completed") {
            clearInterval(timers.current[sessionId]);
            setRegens((r) => ({ ...r, [sessionId]: { status: "idle" } }));
            onDone();
          } else if (s.status === "failed" || s.error) {
            clearInterval(timers.current[sessionId]);
            setRegens((r) => ({ ...r, [sessionId]: { status: "error", message: `${s.error?.message ?? "That didn't work."} Your session is unchanged.` } }));
          }
        } catch {
          // Keep polling through network blips.
        }
      }, 2000);
    },
    [onDone],
  );

  return { regens, setRegens, follow };
}

export function PlanView({
  planId,
  initialDoc,
  initialVersion,
  versions,
  today,
  latestRequest,
  builtOffline,
  lifecycle,
  calendar,
}: {
  planId: string;
  initialDoc: PlanDoc;
  initialVersion: number;
  versions: VersionSummary[];
  today: Weekday;
  latestRequest: RequestStatus | null;
  builtOffline: boolean;
  lifecycle: { status: PlanStatus; pausedAt: string | null; completedAt: string | null };
  calendar: CalendarContext;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { doc, version, pending, edit, toast, notify, dismissToast } = usePlan(planId, initialDoc, initialVersion);
  const [view, setView] = useState<View>(params.get("view") === "week" ? "week" : "today");
  const [day, setDay] = useState<Weekday>(today);
  const [focus, setFocus] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  // Back from Google OAuth with ?export=google → reopen the export sheet.
  const [exporting, setExporting] = useState<Exporting>(() => {
    const flag = params.get("calendar");
    return params.get("export") === "google" && (!flag || flag === "connected") ? { provider: "google" } : null;
  });
  const [tzOpen, setTzOpen] = useState(false);
  const refresh = useCallback(() => router.refresh(), [router]);
  const { regens, setRegens, follow } = useRegeneration(refresh);

  // Resume following a regeneration that was running when the page loaded.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !latestRequest) return;
    resumed.current = true;
    if (latestRequest.kind === "regenerate_session" && (latestRequest.status === "queued" || latestRequest.status === "processing")) {
      const sid = (latestRequest.params as { sessionId?: string }).sessionId;
      if (sid) follow(sid, latestRequest.id);
    }
  }, [latestRequest, follow]);

  // Returning from Google OAuth: announce the result and tidy the URL.
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current) return;
    const flag = params.get("calendar");
    const reopen = params.get("export");
    if (!flag && !reopen) return;
    handledReturn.current = true;
    if (flag && CALENDAR_FLAGS[flag]) notify(CALENDAR_FLAGS[flag].tone, CALENDAR_FLAGS[flag].message);
    const q = new URLSearchParams(params);
    q.delete("calendar");
    q.delete("export");
    router.replace(q.size ? `?${q}` : "?", { scroll: false });
  }, [params, notify, router]);

  const switchView = (v: View) => {
    setView(v);
    const q = new URLSearchParams(params);
    if (v === "week") q.set("view", "week");
    else q.delete("view");
    router.replace(`?${q}`, { scroll: false });
  };

  const selectFromGrid = (d: Weekday, sessionId?: string) => {
    setDay(d);
    if (sessionId) {
      setFocus(sessionId);
      requestAnimationFrame(() => document.getElementById(`session-${sessionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const regenerate = async (sessionId: string, note: string) => {
    setRegens((r) => ({ ...r, [sessionId]: { status: "working" } }));
    const result = await requestSessionRegeneration(planId, sessionId, note);
    if (!result.ok) {
      setRegens((r) => ({ ...r, [sessionId]: { status: "error", message: result.message } }));
      return;
    }
    follow(sessionId, result.requestId);
  };

  const calendarState = calendar.exports.google?.state ?? calendar.exports.ics?.state ?? null;
  const calendarLabel =
    calendarState === null ? "Add routine to calendar" : calendarState === "current" ? "In your calendar" : "Update calendar";
  const calendarIcon =
    calendarState === null ? <CalendarPlus aria-hidden /> : calendarState === "current" ? <CalendarCheck2 aria-hidden /> : <RefreshCw aria-hidden />;

  const shownDay = view === "today" ? today : day;
  const sessions = sessionsOn(doc, shownDay);
  const minutes = dayMinutes(doc)[shownDay];
  const adjusting =
    latestRequest?.kind === "adjust" && (latestRequest.status === "queued" || latestRequest.status === "processing") ? latestRequest : null;
  const lastFailed = latestRequest?.status === "failed" && latestRequest.kind === "adjust" ? latestRequest : null;
  const editing = editor?.mode === "edit" ? doc.sessions.find((s) => s.id === editor.sessionId) : undefined;
  const usesAffirmations = doc.affirmations.length > 0 || doc.sessions.some((s) => s.technique === "affirmations");
  const usesAskfirmations = doc.askfirmations.length > 0 || doc.sessions.some((s) => s.technique === "askfirmations");

  return (
    <div className="mx-auto w-full max-w-5xl px-gutter py-8 sm:px-8 sm:py-12 lg:px-12">
      {/* Header ------------------------------------------------------------ */}
      <header className="animate-rise">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">My manifestation</p>
        <p className="mt-2 max-w-2xl text-lg font-semibold leading-snug">{doc.manifestation.desire}</p>
        <h1 className="mt-6 text-display-md font-extrabold">{doc.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-sm border-2 border-ink bg-accent px-2 py-0.5 font-mono text-xs font-bold">{dailyEstimate(doc)}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {doc.sessions.length} {doc.sessions.length === 1 ? "session" : "sessions"}
          </span>
          <button
            type="button"
            onClick={() => setTzOpen(true)}
            className="inline-flex min-h-9 items-center gap-1 rounded-sm px-1 font-mono text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-ink"
          >
            <Globe className="size-3.5" aria-hidden />
            {zoneCity(doc.timezone)} time ({zoneAbbreviation(doc.timezone)})
          </button>
        </div>
        {doc.explanation && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">{doc.explanation}</p>}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            onClick={() => setExporting({})}
            iconLeft={calendarIcon}
            variant={calendarState === "current" ? "secondary" : "primary"}
            className="sm:order-first"
          >
            {calendarLabel}
          </Button>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => setAdjustOpen(true)}
              iconLeft={<SlidersHorizontal aria-hidden />}
              disabled={Boolean(adjusting)}
            >
              Adjust
            </Button>
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => setEditor({ mode: "add" })} iconLeft={<Plus aria-hidden />}>
              Add a session
            </Button>
            <PlanLifecycle
              planId={planId}
              title={doc.title}
              desire={doc.manifestation.desire}
              status={lifecycle.status}
              pausedAt={lifecycle.pausedAt}
              completedAt={lifecycle.completedAt}
              inGoogle={Boolean(calendar.exports.google)}
              hasIcsExport={Boolean(calendar.exports.ics)}
              viewerTimeZone={calendar.viewerTimeZone}
              planToday={calendar.planToday}
              notify={notify}
            />
          </div>
        </div>
      </header>

      <div className="mt-8 space-y-3">
        <LifecycleBanner
          planId={planId}
          status={lifecycle.status}
          pausedAt={lifecycle.pausedAt}
          completedAt={lifecycle.completedAt}
          viewerTimeZone={calendar.viewerTimeZone}
          notify={notify}
        />
        <PlanCalendarPanel
          ctx={calendar}
          paused={lifecycle.status !== "active" && lifecycle.status !== "ready"}
          onOpenExport={(provider) => setExporting({ provider })}
          notify={notify}
        />
        {adjusting && (
          <Notice tone="info" title="We're updating your routine">
            Your current routine stays here until the new one is ready.{" "}
            <Link href={`${routes.plans}/generating/${adjusting.id}`} className="font-semibold underline decoration-2 underline-offset-4">
              See progress
            </Link>
          </Notice>
        )}
        {lastFailed && (
          <Notice tone="error" title="Your last adjustment didn't go through">
            Nothing changed.{" "}
            <Link href={`${routes.plans}/generating/${lastFailed.id}`} className="font-semibold underline decoration-2 underline-offset-4">
              Try again
            </Link>
          </Notice>
        )}
      </div>

      {doc.philosophy && (
        <aside className="mt-8 rounded-lg border-2 border-ink/15 bg-surface p-5">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">How to use this</p>
          <p className="mt-2 leading-relaxed">{doc.philosophy}</p>
        </aside>
      )}

      {/* Schedule ---------------------------------------------------------------- */}
      <section aria-label="Schedule" className="mt-12">
        <div role="tablist" aria-label="Schedule view" className="inline-flex rounded-md border-2 border-ink bg-surface p-1 shadow-hard-xs">
          {(["today", "week"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => switchView(v)}
              className={cn(
                "min-w-24 rounded-sm px-4 py-2 font-semibold transition-colors",
                view === v ? "bg-ink text-surface" : "hover:bg-ink/5",
              )}
            >
              {v === "today" ? "Today" : "Week"}
            </button>
          ))}
        </div>

        {view === "week" && (
          <div className="mt-6 space-y-5">
            {doc.patterns.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {doc.patterns.map((p) => (
                  <li key={p.id} className="rounded-md border-2 border-ink/15 bg-surface p-3">
                    <p className="text-sm font-bold">
                      {p.label}{" "}
                      <span className="font-mono text-xs font-normal text-muted-foreground">
                        {WEEK.filter((w) => p.days.includes(w.day))
                          .map((w) => w.short)
                          .join(" ")}
                      </span>
                    </p>
                    {p.summary && <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div className="hidden md:block">
              <WeekGrid doc={doc} today={today} selected={day} onSelect={selectFromGrid} />
            </div>
            <div className="md:hidden">
              <DayStrip doc={doc} selected={day} today={today} onSelect={setDay} />
            </div>
          </div>
        )}

        <div className="mt-8 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {view === "today" ? "Today" : WEEK[shownDay - 1].long}
            {view === "today" && <span className="text-muted-foreground"> · {WEEK[today - 1].long}</span>}
          </h2>
          <p className="font-mono text-sm text-muted-foreground">{minutes ? formatMinutes(minutes) : "Rest day"}</p>
        </div>

        {sessions.length === 0 ? (
          <div className="mt-4 rounded-lg border-2 border-dashed border-ink/30 p-8 text-center">
            <p className="font-display text-xl font-bold">Nothing scheduled.</p>
            <p className="mt-1 text-muted-foreground">A day off is part of the routine, not a break from it.</p>
          </div>
        ) : (
          <ol className="mt-4 space-y-3">
            {sessions.map((s) => (
              <li key={s.id}>
                <SessionCard
                  session={s}
                  doc={doc}
                  highlight={focus === s.id}
                  disabled={pending}
                  regen={regens[s.id] ?? { status: "idle" }}
                  onEdit={() => setEditor({ mode: "edit", sessionId: s.id })}
                  onDuplicate={() => edit({ type: "duplicate_session", id: s.id }, "Session duplicated")}
                  onRemove={() => edit({ type: "remove_session", id: s.id }, "Session removed")}
                  onRegenerate={(note) => regenerate(s.id, note)}
                  onAddToCalendar={() => setExporting({ sessionId: s.id })}
                />
              </li>
            ))}
          </ol>
        )}

        {view === "today" && (
          <button
            type="button"
            onClick={() => switchView("week")}
            className="mt-5 inline-flex items-center gap-1.5 rounded-sm font-semibold underline decoration-2 underline-offset-4"
          >
            See the whole week <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
      </section>

      {/* Library -------------------------------------------------------------------- */}
      {(usesAffirmations || usesAskfirmations) && (
        <div className="mt-16 grid gap-12 border-t-2 border-ink pt-10 lg:grid-cols-2">
          {usesAffirmations && (
            <LibraryEditor
              title="Your affirmations"
              kind="affirmation"
              items={doc.affirmations}
              edit={edit}
              disabled={pending}
              emptyText="No affirmations yet."
            />
          )}
          {usesAskfirmations && (
            <LibraryEditor
              title="Your askfirmations"
              kind="askfirmation"
              items={doc.askfirmations}
              edit={edit}
              disabled={pending}
              emptyText="No questions yet."
            />
          )}
        </div>
      )}

      <div className="mt-16 space-y-4">
        <VersionHistory planId={planId} versions={versions} current={version} onError={(m) => notify("error", m)} />
        {builtOffline && (
          <p className="text-xs text-muted-foreground">Built with the offline demo builder. Add a Gemini API key for personalised routines.</p>
        )}
      </div>

      {editor && (
        <SessionEditor
          key={editor.mode === "edit" ? editor.sessionId : "new"}
          open
          mode={editor.mode}
          doc={doc}
          initial={editing ? toInput(editing) : { ...blankSession, days: [shownDay] }}
          saving={pending}
          onClose={() => setEditor(null)}
          onSave={async (input) => {
            const r =
              editor.mode === "edit"
                ? await edit({ type: "update_session", id: editor.sessionId, session: input }, "Session saved")
                : await edit({ type: "add_session", session: input }, "Session added");
            return r.ok;
          }}
        />
      )}
      {adjustOpen && <AdjustDialog open onClose={() => setAdjustOpen(false)} planId={planId} doc={doc} />}
      {exporting && (
        <ExportSheet
          key={`${exporting.provider ?? ""}${exporting.sessionId ?? ""}`}
          open
          onClose={() => setExporting(null)}
          doc={doc}
          ctx={calendar}
          initialProvider={exporting.provider}
          onlySessionId={exporting.sessionId}
          onGoogleDone={refresh}
        />
      )}
      {tzOpen && (
        <TimezoneDialog
          current={doc.timezone}
          viewerTimeZone={calendar.viewerTimeZone}
          saving={pending}
          onClose={() => setTzOpen(false)}
          onSave={async (timezone) => {
            const r = await edit({ type: "set_timezone", timezone }, "Timezone updated");
            if (r.ok) setTzOpen(false);
          }}
        />
      )}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

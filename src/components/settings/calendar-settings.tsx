"use client";

import { CalendarCheck2, CalendarPlus, Lock, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChoiceCard } from "@/components/intake/controls";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { controlClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { disconnectGoogleCalendar, saveCalendarPreferences } from "@/lib/actions/calendar";
import { titleStyleLabels, TITLE_STYLES, type CalendarPreferences } from "@/lib/calendar/model";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";

const DETAILS: { key: keyof CalendarPreferences["include"]; label: string }[] = [
  { key: "instructions", label: "How to do it" },
  { key: "affirmations", label: "Affirmations" },
  { key: "visualization", label: "Visualization scene" },
  { key: "link", label: "Link back to Assume" },
];

const FLAG_COPY: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: { tone: "success", text: "Google Calendar connected." },
  denied: { tone: "error", text: "Google Calendar wasn't connected." },
  scope: { tone: "error", text: "Assume needs permission to manage its own calendar. Try again and leave that box ticked." },
  expired: { tone: "error", text: "That took a little long. Please connect again." },
  unavailable: { tone: "error", text: "Google Calendar isn't switched on for this environment." },
  error: { tone: "error", text: "Google didn't respond as expected. Please try again." },
};

export function CalendarPrivacyForm({ initial }: { initial: CalendarPreferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    const r = await saveCalendarPreferences(prefs).catch(() => ({ ok: false as const, message: "We couldn't reach the server." }));
    setSaving(false);
    setStatus(r.ok ? { tone: "success", text: "Saved. New exports will use these." } : { tone: "error", text: r.message });
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Event titles</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TITLE_STYLES.map((style) => (
            <ChoiceCard
              key={style}
              name="default-title-style"
              value={style}
              size="sm"
              checked={prefs.titleStyle === style}
              onChange={() => setPrefs((p) => ({ ...p, titleStyle: style }))}
              label={titleStyleLabels[style].label}
              description={style === "descriptive" ? "“SP affirmations”" : style === "custom" ? "Your own words" : `“${titleStyleLabels[style].example("")}”`}
            />
          ))}
        </div>
        {prefs.titleStyle === "custom" && (
          <input
            value={prefs.customTitle}
            onChange={(e) => setPrefs((p) => ({ ...p, customTitle: e.target.value }))}
            maxLength={80}
            placeholder="e.g. Me time"
            aria-label="Custom event title"
            className={cn(controlClasses, "mt-3 h-12")}
          />
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Include in event descriptions</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DETAILS.map((d) => (
            <label key={d.key} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-ink/20 bg-background px-3 has-checked:border-ink">
              <input
                type="checkbox"
                checked={prefs.include[d.key]}
                onChange={() => setPrefs((p) => ({ ...p, include: { ...p.include, [d.key]: !p.include[d.key] } }))}
                className="size-5 accent-[var(--ink)]"
              />
              <span className="text-sm font-semibold">{d.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Calendars show up on lock screens and shared views. You can change this on every export.</p>
      </fieldset>

      <label className="block space-y-2">
        <span className="text-sm font-semibold">Reminder</span>
        <select
          value={prefs.reminderMinutes === null ? "none" : String(prefs.reminderMinutes)}
          onChange={(e) => setPrefs((p) => ({ ...p, reminderMinutes: e.target.value === "none" ? null : Number(e.target.value) }))}
          className={cn(controlClasses, "h-12")}
        >
          <option value="none">No reminder</option>
          <option value="0">When it starts</option>
          {[5, 10, 15, 30].map((m) => (
            <option key={m} value={m}>
              {m} minutes before
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button onClick={save} loading={saving} loadingText="Saving…" disabled={!dirty || (prefs.titleStyle === "custom" && !prefs.customTitle.trim())}>
          Save calendar privacy
        </Button>
        {status && <p className={cn("text-sm font-medium", status.tone === "error" && "text-destructive")} role="status">{status.text}</p>}
      </div>
    </div>
  );
}

export function GoogleConnection({
  available,
  connection,
  flag,
}: {
  available: boolean;
  connection: { status: "connected" | "needs_reconnect"; calendarName: string | null; connectedAt: string } | null;
  flag: string | null;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [removeCalendar, setRemoveCalendar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(flag ? (FLAG_COPY[flag] ?? null) : null);
  const connectHref = `${routes.googleConnect}?next=${encodeURIComponent(routes.settings)}`;

  const disconnect = async () => {
    setBusy(true);
    const r = await disconnectGoogleCalendar(removeCalendar).catch(() => ({ ok: false as const, message: "We couldn't reach the server." }));
    setBusy(false);
    setConfirm(false);
    if (!r.ok) return setMessage({ tone: "error", text: r.message });
    setMessage({
      tone: "success",
      text: r.calendarRemoved ? "Disconnected, and the Assume calendar was removed." : "Disconnected. Events already in Google Calendar stay there.",
    });
    router.replace(routes.settings);
    router.refresh();
  };

  if (!available) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Google Calendar sync isn&apos;t switched on for this environment. Calendar files (.ics) work with Apple Calendar, Google Calendar,
        Outlook and most others.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {connection ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md border-2 border-ink bg-accent-soft">
              <CalendarCheck2 className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">{connection.status === "needs_reconnect" ? "Needs reconnecting" : "Connected"}</p>
              <p className="text-sm text-muted-foreground">Syncs to a calendar called “{connection.calendarName ?? "Assume"}”.</p>
            </div>
          </div>
          <div className="flex gap-2">
            {connection.status === "needs_reconnect" && (
              <a href={connectHref} className={buttonClasses({ size: "sm" })}>
                Reconnect
              </a>
            )}
            <Button size="sm" variant="secondary" iconLeft={<Unplug aria-hidden />} onClick={() => setConfirm(true)}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            Assume creates its own calendar and only ever touches that one. It can&apos;t see or change your other events.
          </p>
          <a href={connectHref} className={buttonClasses({ variant: "secondary" })}>
            <CalendarPlus aria-hidden />
            Connect Google Calendar
          </a>
        </div>
      )}

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Disconnect Google Calendar?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant={removeCalendar ? "destructive" : "ink"} loading={busy} loadingText="Disconnecting…" onClick={disconnect}>
              Disconnect
            </Button>
          </>
        }
      >
        <p className="leading-relaxed">Assume will stop updating your calendar and forget its access.</p>
        <label className="mt-5 flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-ink bg-surface px-3 py-2.5">
          <input type="checkbox" checked={removeCalendar} onChange={(e) => setRemoveCalendar(e.target.checked)} className="size-5 accent-[var(--ink)]" />
          <span className="text-sm font-semibold">Also delete the “{connection?.calendarName ?? "Assume"}” calendar and all its events</span>
        </label>
      </Dialog>
    </div>
  );
}

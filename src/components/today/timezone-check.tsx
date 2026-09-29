"use client";

import { Globe, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { readStorage, useClientValue, writeStorage } from "@/hooks/use-client-value";
import { updateTimezone } from "@/lib/actions/profile";
import { zoneCity } from "@/lib/calendar/zoned";

const key = (profile: string, device: string) => `assume:tz-dismissed:${profile}:${device}`;

/**
 * Times on Today are shown in the profile's timezone. If this device is
 * somewhere else (travel, or a profile still on the UTC default), offer to
 * switch — never silently.
 */
export function TimezoneCheck({ profileTimeZone }: { profileTimeZone: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const device = useClientValue(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === profileTimeZone) return null;
    // Same offset right now (e.g. Europe/London vs Europe/Dublin) isn't worth interrupting for.
    const offset = (zone: string) => new Date().toLocaleString("en-US", { timeZone: zone, timeZoneName: "longOffset" }).split("GMT")[1];
    if (offset(tz) === offset(profileTimeZone)) return null;
    return readStorage(key(profileTimeZone, tz)) === "1" ? null : tz;
  }, null);

  if (!device || hidden) return null;

  const dismiss = () => {
    writeStorage(key(profileTimeZone, device), "1");
    setHidden(true);
  };

  const switchZone = async () => {
    setBusy(true);
    setError(null);
    const r = await updateTimezone(device).catch(() => ({ ok: false as const, message: "We couldn't reach the server." }));
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setHidden(true);
    router.refresh();
  };

  return (
    <div role="status" className="relative flex flex-col gap-3 rounded-lg border-2 border-ink bg-surface p-4 pr-12 shadow-hard-xs animate-pop sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm leading-relaxed">
        <Globe className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Times here are in <span className="font-semibold">{zoneCity(profileTimeZone)}</span> time, but this device is set to{" "}
          <span className="font-semibold">{zoneCity(device)}</span>.
          {error && <span className="mt-1 block font-medium text-destructive">{error}</span>}
        </span>
      </p>
      <Button size="sm" variant="secondary" loading={busy} onClick={switchZone} className="shrink-0">
        Use {zoneCity(device)} time
      </Button>
      <button type="button" onClick={dismiss} aria-label="Keep the current timezone" className="absolute right-2 top-2 grid size-10 place-items-center rounded-md hover:bg-ink/5">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

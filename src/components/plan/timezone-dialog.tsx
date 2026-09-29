"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/field";
import { zoneAbbreviation, zoneCity } from "@/lib/calendar/zoned";

/**
 * Which timezone a routine runs in. Sessions keep their wall-clock times
 * (7:30am stays 7:30am) in the new zone — what people expect after a move.
 */
export function TimezoneDialog({
  current,
  viewerTimeZone,
  saving,
  onClose,
  onSave,
}: {
  current: string;
  viewerTimeZone: string;
  saving: boolean;
  onClose: () => void;
  onSave: (timezone: string) => void;
}) {
  const [value, setValue] = useState(current);
  const zones = useMemo(() => {
    const all = new Set<string>(["UTC", ...Intl.supportedValuesOf("timeZone")]);
    all.add(current);
    return [...all];
  }, [current]);
  const device = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const suggestions = [...new Set([device, viewerTimeZone].filter((z): z is string => Boolean(z) && z !== current))];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Routine timezone"
      description={`Right now: ${zoneCity(current)} (${zoneAbbreviation(current)}).`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(value)} loading={saving} loadingText="Saving…" disabled={value === current}>
            Use {zoneCity(value)} time
          </Button>
        </>
      }
    >
      <p className="leading-relaxed">
        Sessions keep their times — a 7:30am session stays at 7:30am, now in the new timezone. Handy after a move.
      </p>
      {suggestions.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {suggestions.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setValue(z)}
              aria-pressed={value === z}
              className="min-h-11 rounded-md border-2 border-ink bg-surface px-3 text-sm font-semibold aria-pressed:bg-accent"
            >
              {zoneCity(z)}
              {z === device ? " · this device" : ""}
            </button>
          ))}
        </div>
      )}
      <SelectField label="Timezone" value={value} onChange={(e) => setValue(e.target.value)} containerClassName="mt-5">
        {zones.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </SelectField>
      <p className="mt-4 text-sm text-muted-foreground">If this routine is in Google Calendar, Assume will offer to update it.</p>
    </Dialog>
  );
}

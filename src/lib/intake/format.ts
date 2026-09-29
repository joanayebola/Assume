import {
  commitmentKinds,
  routineStyleOptions,
  techniqueInfo,
  timeBudgetOptions,
} from "@/content/intake";

import type { Commitment, IntakeSections, Technique, Weekday } from "./model";

export function formatClock(hhmm: string) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(2000, 0, 1, h, m))
    .replace(" ", "")
    .toLowerCase();
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatWeekdays(days: Weekday[]) {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === "1,2,3,4,5,6,7") return "Every day";
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "6,7") return "Weekends";
  // Collapse runs of 3+ consecutive days: Mon–Thu
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${dayNames[sorted[i] - 1]}–${dayNames[sorted[j] - 1]}` : dayNames[sorted[i] - 1]);
    if (j - i === 1) parts.push(dayNames[sorted[j] - 1]);
    i = j + 1;
  }
  return parts.join(", ");
}

export function formatCommitment(c: Commitment) {
  const time =
    c.start && c.end ? `${formatClock(c.start)}–${formatClock(c.end)}` : c.start ? `from ${formatClock(c.start)}` : "";
  return [c.label || commitmentKinds[c.kind].label, formatWeekdays(c.weekdays), time].filter(Boolean).join(" · ");
}

/** "Can manifest during this" / "During this: Affirmations, Subliminals" / "Not during this". */
export function formatOverlap(c: Commitment) {
  if (c.overlap === "yes") return "Can manifest during this";
  if (c.overlap === "no") return "Not during this";
  if (c.overlap === "some") {
    const names = c.overlapTechniques.map((t) =>
      t === "other" && c.overlapOtherLabel.trim() ? c.overlapOtherLabel.trim() : techniqueInfo[t].label,
    );
    return `During this: ${names.join(", ")}`;
  }
  return "";
}

export function formatDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(y, m - 1, d),
  );
}

export function techniqueLabel(t: Technique, otherLabel: string) {
  return t === "other" && otherLabel.trim() ? otherLabel.trim() : techniqueInfo[t].label;
}

export function formatTimeBudget(s: IntakeSections["intensity"]) {
  if (s.timeBudget === "custom") return s.customMinutes ? `${s.customMinutes} minutes a day` : "Custom";
  return timeBudgetOptions.find((o) => o.value === s.timeBudget)?.label ?? "";
}

export function formatStyle(s: IntakeSections["intensity"]) {
  const o = routineStyleOptions.find((x) => x.value === s.style);
  if (!o) return "";
  return s.style === "custom" ? `Custom — ${s.styleNote.trim()}` : `${o.label} — ${o.description}`;
}

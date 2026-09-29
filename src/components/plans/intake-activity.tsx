import { ArrowRight, Hourglass } from "lucide-react";
import Link from "next/link";

import { stepMeta } from "@/content/intake";
import { STEP_KEYS, type GenerationRequestSummary, type IntakeSummary } from "@/lib/intake/model";
import { routes } from "@/lib/site";

import { DiscardDraftButton } from "./discard-draft-button";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(iso));
}

export function DraftCard({ draft }: { draft: IntakeSummary }) {
  const total = STEP_KEYS.length - 1;
  const done = Math.min(draft.completedCount, total);
  // Every answer given: the next step is building (checkout decides if payment is needed).
  const ready = done >= total;
  return (
    <li className="flex flex-col gap-4 rounded-lg border-2 border-ink bg-surface p-5 shadow-hard-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {ready ? "Answers complete" : `In progress · ${done}/${total} steps`} · {timeAgo(draft.updatedAt)}
        </p>
        <p className="mt-1.5 truncate text-lg font-bold tracking-tight">{draft.title || "Untitled plan"}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{ready ? "Ready to build your routine" : `Next: ${stepMeta[draft.currentStep].label}`}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <DiscardDraftButton intakeId={draft.id} title={draft.title || "untitled plan"} />
        <Link
          href={ready ? `${routes.checkout}?intake=${draft.id}` : `${routes.newPlan}/${draft.id}`}
          className="inline-flex h-11 items-center gap-2 rounded-md border-2 border-ink bg-accent px-4 font-semibold shadow-hard-sm transition-[transform,box-shadow] duration-100 hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-md active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          {ready ? "Build it" : "Continue"}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </li>
  );
}

export function RequestCard({ request }: { request: GenerationRequestSummary }) {
  return (
    <li>
      <Link
        href={`${routes.plans}/generating/${request.id}`}
        className="flex items-center gap-4 rounded-lg border-2 border-ink bg-background p-5 transition-colors hover:bg-surface"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-md border-2 border-ink bg-surface">
          <Hourglass className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {request.status === "failed" ? "Needs attention" : request.status === "processing" ? "Being built now" : "Waiting to be built"}
          </span>
          <span className="mt-1 block truncate text-lg font-bold tracking-tight">{request.title}</span>
        </span>
        <ArrowRight className="size-5 shrink-0" aria-hidden />
      </Link>
    </li>
  );
}

export function IntakeActivity({
  drafts,
  requests,
}: {
  drafts: IntakeSummary[];
  requests: GenerationRequestSummary[];
}) {
  if (drafts.length === 0 && requests.length === 0) return null;
  return (
    <div className="space-y-3">
      {requests.length > 0 && (
        <ul className="space-y-3" aria-label="Plans waiting to be built">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </ul>
      )}
      {drafts.length > 0 && (
        <ul className="space-y-3" aria-label="Plans in progress">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

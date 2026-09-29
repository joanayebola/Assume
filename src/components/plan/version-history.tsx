"use client";

import { History, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { restorePlanVersion } from "@/lib/actions/plan";
import type { VersionSummary } from "@/lib/plan/store";

const sourceLabel: Record<VersionSummary["source"], string> = {
  generated: "Built",
  adjusted: "Adjusted",
  session_regenerated: "Session regenerated",
  user_edit: "Your edits",
  restored: "Restored",
  duplicated: "Copied",
};

function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function VersionHistory({
  planId,
  versions,
  current,
  onError,
}: {
  planId: string;
  versions: VersionSummary[];
  current: number;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  if (versions.length <= 1) return null;

  return (
    <details className="group rounded-lg border-2 border-ink bg-surface">
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 font-semibold sm:p-5">
        <span className="inline-flex items-center gap-2">
          <History className="size-4" aria-hidden />
          Version history
          <span className="font-mono text-xs text-muted-foreground">({versions.length})</span>
        </span>
        <span className="text-sm text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden text-sm text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <ol className="divide-y-2 divide-ink/10 border-t-2 border-ink">
        {versions.map((v) => (
          <li key={v.version} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                v{v.version} · {sourceLabel[v.source]}
                {v.version === current && <span className="ml-2 rounded-xs bg-ink px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-surface">Current</span>}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {v.summary ?? "—"} · {when(v.createdAt)}
              </p>
            </div>
            {v.version !== current &&
              (confirming === v.version ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    loading={restoring === v.version}
                    onClick={async () => {
                      setRestoring(v.version);
                      const r = await restorePlanVersion(planId, v.version);
                      setRestoring(null);
                      setConfirming(null);
                      if (!r.ok) onError(r.message);
                      else router.refresh();
                    }}
                  >
                    Restore v{v.version}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" iconLeft={<RotateCcw aria-hidden />} onClick={() => setConfirming(v.version)}>
                  Restore
                </Button>
              ))}
          </li>
        ))}
      </ol>
      <p className="border-t-2 border-ink/10 px-4 py-3 text-xs text-muted-foreground sm:px-5">
        Restoring never deletes anything — it adds the old version as the newest one.
      </p>
    </details>
  );
}

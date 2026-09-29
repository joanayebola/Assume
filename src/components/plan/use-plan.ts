"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { applyPlanEdit } from "@/lib/actions/plan";
import type { EditOp } from "@/lib/plan/edits";
import type { PlanDoc } from "@/lib/plan/schema";

export type Toast = { id: number; tone: "success" | "error"; message: string };

/**
 * Local plan state + edit operations. Each edit is sent as an operation with
 * the version it was based on; if another tab changed the plan meanwhile the
 * server refuses it and we reload the latest version instead of overwriting.
 */
export function usePlan(planId: string, initialDoc: PlanDoc, initialVersion: number) {
  const router = useRouter();
  const [doc, setDoc] = useState(initialDoc);
  const [version, setVersion] = useState(initialVersion);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionRef = useRef(initialVersion);

  const notify = useCallback((tone: Toast["tone"], message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), tone, message });
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 6000 : 3000);
  }, []);

  const edit = useCallback(
    async (op: EditOp, success?: string) => {
      setPending(true);
      try {
        const result = await applyPlanEdit(planId, versionRef.current, op);
        if (result.ok) {
          setDoc(result.doc);
          setVersion(result.version);
          versionRef.current = result.version;
          if (success) notify("success", success);
        } else {
          notify("error", result.message);
          if (result.code === "conflict") router.refresh();
        }
        return result;
      } catch {
        notify("error", "We couldn't reach the server. Check your connection and try again.");
        return { ok: false as const, code: "error" as const, message: "Network error" };
      } finally {
        setPending(false);
      }
    },
    [planId, notify, router],
  );

  return { doc, version, pending, edit, toast, notify, dismissToast: () => setToast(null) };
}

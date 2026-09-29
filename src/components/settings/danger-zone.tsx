"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { controlClasses } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { deleteAccount } from "@/lib/actions/account";
import { cn } from "@/lib/utils";

export function DeleteAccount({ googleConnected }: { googleConnected: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [removeCalendar, setRemoveCalendar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const confirmed = text.trim().toUpperCase() === "DELETE";

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await deleteAccount(text, removeCalendar); // redirects on success
      if (r && !r.ok) setError(r.message);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
      setError("We couldn't reach the server. Nothing was deleted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="leading-relaxed">
        Permanently deletes your account, manifestations, answers, routines, calendar connections and manifested archive.
      </p>
      <Button variant="destructive" className="mt-5" iconLeft={<Trash2 aria-hidden />} onClick={() => setOpen(true)}>
        Delete my account
      </Button>

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Delete your account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy} autoFocus>
              Keep my account
            </Button>
            <Button variant="destructive" disabled={!confirmed} loading={busy} loadingText="Deleting…" onClick={submit}>
              Delete everything
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <p className="leading-relaxed">
            This can&apos;t be undone. Everything you&apos;ve written in Assume is erased. Events you imported into a calendar app from a file
            stay there.
          </p>
          {googleConnected && (
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-ink bg-surface px-3 py-2.5">
              <input type="checkbox" checked={removeCalendar} onChange={(e) => setRemoveCalendar(e.target.checked)} className="size-5 accent-[var(--ink)]" />
              <span className="text-sm font-semibold">Also delete the Assume calendar in Google Calendar</span>
            </label>
          )}
          <label htmlFor={inputId} className="block space-y-2">
            <span className="text-sm font-semibold">
              Type <span className="font-mono">DELETE</span> to confirm
            </span>
            <input
              id={inputId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className={cn(controlClasses, "h-12 font-mono")}
            />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </Dialog>
    </>
  );
}

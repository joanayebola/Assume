"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import type { EditOp } from "@/lib/plan/edits";
import type { LibraryItem } from "@/lib/plan/schema";

import { AutoTextarea } from "../intake/controls";

const sourceLabel: Record<LibraryItem["source"], string> = {
  user: "Yours",
  generated: "Written for you",
  custom: "Added",
};

function Row({
  item,
  kind,
  edit,
  disabled,
}: {
  item: LibraryItem;
  kind: "affirmation" | "askfirmation";
  edit: (op: EditOp, success?: string) => Promise<unknown>;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [confirm, setConfirm] = useState(false);
  const id = useId();

  if (editing) {
    return (
      <li className="rounded-md border-2 border-ink bg-surface p-3">
        <label htmlFor={id} className="sr-only">
          Edit {kind}
        </label>
        <AutoTextarea id={id} value={text} onChange={(e) => setText(e.target.value)} minRows={1} maxLength={500} autoFocus />
        <div className="mt-2 flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(item.text);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={disabled || !text.trim()}
            iconLeft={<Check aria-hidden />}
            onClick={async () => {
              await edit({ type: "update_library_item", kind, id: item.id, text }, "Saved");
              setEditing(false);
            }}
          >
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 rounded-md border-2 border-ink/15 bg-surface p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{item.text}</p>
        <p className="mt-1 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">{sourceLabel[item.source]}</p>
      </div>
      {confirm ? (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="destructive" disabled={disabled} onClick={() => edit({ type: "remove_library_item", kind, id: item.id }, "Removed")}>
            Remove
          </Button>
          <button type="button" onClick={() => setConfirm(false)} aria-label="Keep it" className="grid size-9 place-items-center rounded-md hover:bg-ink/5">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 gap-0.5">
          <button type="button" onClick={() => setEditing(true)} disabled={disabled} aria-label={`Edit “${item.text}”`} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-ink/5 hover:text-ink">
            <Pencil className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setConfirm(true)} disabled={disabled} aria-label={`Remove “${item.text}”`} className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-ink">
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}

export function LibraryEditor({
  title,
  kind,
  items,
  edit,
  disabled,
  emptyText,
}: {
  title: string;
  kind: "affirmation" | "askfirmation";
  items: LibraryItem[];
  edit: (op: EditOp, success?: string) => Promise<unknown>;
  disabled: boolean;
  emptyText: string;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();

  return (
    <section aria-labelledby={`${inputId}-title`} className="space-y-4">
      <h2 id={`${inputId}-title`} className="text-display-sm font-bold">
        {title}
      </h2>
      {items.length === 0 && <p className="text-muted-foreground">{emptyText}</p>}
      <ul className="space-y-2">
        {items.map((a) => (
          <Row key={a.id} item={a} kind={kind} edit={edit} disabled={disabled} />
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-start"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          await edit({ type: "add_library_item", kind, text: draft }, kind === "affirmation" ? "Affirmation added" : "Question added");
          setDraft("");
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {kind === "affirmation" ? "Add your own affirmation" : "Add your own askfirmation"}
        </label>
        <AutoTextarea
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          minRows={1}
          maxLength={500}
          placeholder={kind === "affirmation" ? "Add your own affirmation…" : "Add your own question…"}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={disabled || !draft.trim()} iconLeft={<Plus aria-hidden />} className="h-12 shrink-0">
          Add
        </Button>
      </form>
    </section>
  );
}

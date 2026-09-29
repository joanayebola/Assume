"use client";

import { useSearchParams } from "next/navigation";

/** Shown once after someone deletes their account. */
export function AccountDeletedNotice() {
  const params = useSearchParams();
  if (params.get("account") !== "deleted") return null;
  return (
    <div role="status" className="border-b-2 border-ink bg-ink px-gutter py-3 text-center text-sm font-semibold text-surface">
      Your account and everything in it has been deleted. Take care.
    </div>
  );
}

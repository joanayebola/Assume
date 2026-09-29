import Link from "next/link";

import { Notice } from "@/components/ui/notice";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { routes } from "@/lib/site";

/** Shown on auth pages when Supabase env vars are missing (local dev only in practice). */
export function SetupNotice() {
  if (isSupabaseConfigured()) return null;

  if (isDemoMode()) {
    return (
      <Notice tone="info" title="Demo mode is on" className="mb-6">
        Supabase isn&apos;t configured, so accounts are off.{" "}
        <Link href={routes.appHome} className="font-semibold underline decoration-2 underline-offset-4">
          Open the app as a demo user
        </Link>{" "}
        — answers are stored locally in <code className="font-mono font-semibold">.demo-data/</code>.
      </Notice>
    );
  }

  return (
    <Notice tone="error" title="Supabase isn't configured" className="mb-6">
      Copy <code className="font-mono font-semibold">.env.example</code> to{" "}
      <code className="font-mono font-semibold">.env.local</code>, add your Supabase URL and
      publishable key, then restart the dev server.
    </Notice>
  );
}

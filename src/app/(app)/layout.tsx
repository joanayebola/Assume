import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell/app-shell";
import { getViewer } from "@/lib/auth/session";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { displayName, profile, isDemo } = await getViewer();

  return (
    <AppShell displayName={displayName} email={profile.email} isDemo={isDemo}>
      {children}
    </AppShell>
  );
}

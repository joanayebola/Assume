import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { routes } from "@/lib/site";
import { cn, initials } from "@/lib/utils";

import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { SignOutButton } from "./sign-out-button";

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-md border-2 border-ink bg-accent-soft font-display text-sm font-extrabold",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AppShell({
  displayName,
  email,
  isDemo = false,
  children,
}: {
  displayName: string;
  email: string | null;
  isDemo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-1">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r-2 border-ink bg-background lg:flex">
        <div className="flex h-20 items-center px-6">
          <Logo href={routes.appHome} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <SidebarNav />
        </div>
        <div className="space-y-3 border-t-2 border-ink p-4">
          <Link
            href={routes.settings}
            className="flex items-center gap-3 rounded-md border-2 border-transparent p-1.5 hover:border-ink hover:bg-surface"
          >
            <Avatar name={displayName} />
            <span className="min-w-0">
              <span className="block truncate font-semibold tracking-tight">{displayName}</span>
              {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
            </span>
          </Link>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo && (
          <p className="bg-ink px-gutter py-1 text-center font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-surface">
            Demo mode · Supabase not configured · data stored locally
          </p>
        )}
        {/* Mobile top bar */}
        <header className="pt-safe sticky top-0 z-30 border-b-2 border-ink bg-background/95 backdrop-blur-sm lg:hidden">
          <div className="flex h-14 items-center justify-between px-gutter">
            <Logo href={routes.appHome} />
            <Link href={routes.settings} aria-label="Account settings" className="rounded-md">
              <Avatar name={displayName} className="size-9" />
            </Link>
          </div>
        </header>

        <main
          id="main"
          className="flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0"
        >
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

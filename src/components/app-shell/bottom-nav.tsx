"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { appNav } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="App"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-surface lg:hidden"
    >
      <ul className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-4">
        {appNav.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group flex flex-1 flex-col items-center justify-center gap-1 rounded-sm"
              >
                <span
                  className={cn(
                    "grid h-8 w-12 place-items-center rounded-md border-2 transition-[transform,box-shadow,background-color] duration-100",
                    active
                      ? "border-ink bg-accent shadow-hard-xs"
                      : item.primary
                        ? "border-ink bg-background group-active:translate-y-0.5"
                        : "border-transparent group-active:bg-ink/5",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.6 : 2.2} aria-hidden />
                </span>
                <span
                  className={cn(
                    "text-[0.7rem] leading-none tracking-tight",
                    active ? "font-bold text-ink" : "font-medium text-muted-foreground",
                  )}
                >
                  {item.shortLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

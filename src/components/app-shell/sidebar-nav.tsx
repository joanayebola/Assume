"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { appNav } from "./nav-items";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="App">
      <ul className="space-y-1.5">
        {appNav.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-md border-2 px-3 font-semibold tracking-tight",
                  "transition-[transform,box-shadow,background-color] duration-100",
                  active
                    ? "border-ink bg-accent shadow-hard-sm"
                    : "border-transparent hover:border-ink hover:bg-surface",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-sm",
                    item.primary && !active && "border-2 border-ink bg-accent",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={2.4} aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

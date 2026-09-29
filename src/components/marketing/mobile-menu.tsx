"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { ButtonLink } from "@/components/ui/button";

import { CtaLink } from "./cta-link";
import { routes } from "@/lib/site";

export function MobileMenu({ links }: { links: ReadonlyArray<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        className="grid size-11 place-items-center rounded-md border-2 border-ink bg-surface shadow-hard-xs transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      {open && (
        <div
          id={panelId}
          className="fixed inset-x-0 bottom-0 top-[calc(4rem+2px+env(safe-area-inset-top))] z-40 overflow-y-auto border-t-2 border-ink bg-background animate-rise"
        >
          <nav aria-label="Mobile" className="px-gutter py-6">
            <ul className="divide-y-2 divide-ink border-y-2 border-ink">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={close}
                    className="flex items-center justify-between py-4 font-display text-3xl font-bold tracking-tight"
                  >
                    {link.label}
                    <ArrowRight className="size-6" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-8 grid gap-3">
              <CtaLink location="mobile_menu" href={routes.signup} size="lg" block onClick={close}>
                Build my routine
              </CtaLink>
              <ButtonLink href={routes.login} variant="secondary" size="lg" block onClick={close}>
                Log in
              </ButtonLink>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

import { CtaLink } from "./cta-link";
import { Container } from "@/components/ui/container";
import { routes } from "@/lib/site";

import { MobileMenu } from "./mobile-menu";

export const marketingLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#example", label: "Example" },
  { href: "/#features", label: "Features" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  return (
    <header className="pt-safe sticky top-0 z-40 border-b-2 border-ink bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/85">
      <Container size="wide" className="flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {marketingLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-sm px-3 py-2 text-sm font-semibold tracking-tight underline-offset-4 hover:underline hover:decoration-2"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href={routes.login} variant="ghost" size="sm">
            Log in
          </ButtonLink>
          <CtaLink location="header" href={routes.signup} size="sm" iconRight={<ArrowRight aria-hidden />}>
            Build my routine
          </CtaLink>
        </div>

        <MobileMenu links={marketingLinks} />
      </Container>
    </header>
  );
}

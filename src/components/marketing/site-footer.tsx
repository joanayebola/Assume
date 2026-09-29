import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";
import { routes, site } from "@/lib/site";

import { marketingLinks } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-ink bg-background pb-safe">
      <Container size="wide" className="grid gap-10 py-12 sm:grid-cols-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4 sm:col-span-3 md:col-span-1">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{site.tagline}</p>
        </div>
        <nav aria-label="Footer — product">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Product
          </p>
          <ul className="mt-3 space-y-2 text-sm font-medium">
            {marketingLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:underline hover:decoration-2 underline-offset-4">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Footer — account">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account
          </p>
          <ul className="mt-3 space-y-2 text-sm font-medium">
            <li>
              <Link href={routes.signup} className="hover:underline hover:decoration-2 underline-offset-4">
                Create an account
              </Link>
            </li>
            <li>
              <Link href={routes.login} className="hover:underline hover:decoration-2 underline-offset-4">
                Log in
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Footer — legal">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legal</p>
          <ul className="mt-3 space-y-2 text-sm font-medium">
            {[
              { href: routes.terms, label: "Terms" },
              { href: routes.privacy, label: "Privacy" },
              { href: routes.contact, label: "Contact & support" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:underline hover:decoration-2 underline-offset-4">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
      <Container size="wide" className="border-t-2 border-ink py-6">
        <p className="text-xs leading-relaxed text-muted-foreground">
          © {new Date().getFullYear()} {site.name}. Assume is a planning tool for your own practice. It
          doesn&apos;t guarantee outcomes and isn&apos;t a substitute for professional advice.
        </p>
      </Container>
    </footer>
  );
}

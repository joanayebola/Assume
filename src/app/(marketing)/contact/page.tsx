import { ArrowUpRight, LifeBuoy, Mail, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/container";
import { getSupportEmail } from "@/lib/env";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact & support",
  description: "Get help with Assume — your account, routines, calendar or billing.",
  alternates: { canonical: routes.contact },
};

const TOPICS = [
  { title: "Forgot your password", body: "Email us from the address on your account and we'll reset it." },
  { title: "Billing or refunds", body: "Include the email on your account and roughly when you paid." },
  { title: "Something isn't working", body: "Tell us what you tapped and what happened. A screenshot helps." },
  { title: "Privacy or deleting data", body: "You can delete your account yourself in Settings, any time." },
];

export default function ContactPage() {
  const email = getSupportEmail();
  return (
    <Container size="narrow" className="py-14 sm:py-20">
      <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Support</p>
      <h1 className="mt-4 text-display-lg font-extrabold">We&apos;re here.</h1>
      <p className="mt-5 max-w-xl text-xl leading-relaxed text-ink-soft">A real person reads every message. We usually reply within [response time].</p>

      <div className="mt-10 rounded-xl border-2 border-ink bg-surface p-6 shadow-hard-md sm:p-8">
        <span className="grid size-12 place-items-center rounded-md border-2 border-ink bg-accent">
          <Mail className="size-6" aria-hidden />
        </span>
        <p className="mt-5 font-display text-2xl font-bold">Email us</p>
        <a
          href={`mailto:${email}?subject=${encodeURIComponent("Assume support")}`}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 break-all text-lg font-semibold underline decoration-2 underline-offset-4"
        >
          {email} <ArrowUpRight className="size-4 shrink-0" aria-hidden />
        </a>
        <p className="mt-4 text-sm text-muted-foreground">Please don&apos;t include anything personal you&apos;d rather keep private — we don&apos;t need it to help.</p>
      </div>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {TOPICS.map((t) => (
          <li key={t.title} className="rounded-lg border-2 border-ink bg-background p-5">
            <LifeBuoy className="size-5" aria-hidden />
            <p className="mt-3 font-bold">{t.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex items-start gap-3 rounded-md border-2 border-ink bg-accent-soft p-4 text-sm leading-relaxed">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">If you&apos;re in danger or need urgent help,</span> please contact your local emergency services.
          Assume can&apos;t respond to emergencies.
        </p>
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        See also: <Link href={routes.privacy} className="font-semibold text-ink underline decoration-2 underline-offset-4">Privacy</Link> ·{" "}
        <Link href={routes.terms} className="font-semibold text-ink underline decoration-2 underline-offset-4">Terms</Link>
      </p>
    </Container>
  );
}

import { ArrowUpRight, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthFooter, AuthHeading } from "@/components/auth/auth-card";
import { getSupportEmail } from "@/lib/env";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Reset your password" };

/**
 * Password resets are handled by support for now (no reset emails), so this
 * page explains how to reach us instead of sending a link.
 */
export default function ForgotPasswordPage() {
  const email = getSupportEmail();
  const mailto = `mailto:${email}?subject=${encodeURIComponent("Password reset")}&body=${encodeURIComponent(
    "Hi Assume team,\n\nI'd like to reset the password for my account.\n\nThe email I signed up with is: \n",
  )}`;

  return (
    <>
      <AuthHeading
        title="Forgot your password?"
        description="No problem — our support team will reset it for you."
      />

      <div className="rounded-lg border-2 border-ink bg-surface p-5 shadow-hard-sm sm:p-6">
        <span className="grid size-11 place-items-center rounded-md border-2 border-ink bg-accent">
          <Mail className="size-5" aria-hidden />
        </span>
        <p className="mt-4 font-semibold">Email us from the address you signed up with:</p>
        <a
          href={mailto}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 break-all text-lg font-semibold underline decoration-2 underline-offset-4 hover:text-accent-ink"
        >
          {email} <ArrowUpRight className="size-4 shrink-0" aria-hidden />
        </a>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Include “Password reset” in the subject. For your security, we&apos;ll only reset passwords for requests sent
          from the account&apos;s own email address — and we&apos;ll never ask you for your old password.
        </p>
      </div>

      <AuthFooter>
        Remembered it?{" "}
        <Link href={routes.login} className="font-semibold text-ink underline decoration-2 underline-offset-4 hover:text-accent-ink">
          Back to log in
        </Link>
      </AuthFooter>
    </>
  );
}

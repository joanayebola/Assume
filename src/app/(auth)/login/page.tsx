import type { Metadata } from "next";
import Link from "next/link";

import { AuthFooter, AuthHeading } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { SetupNotice } from "@/components/auth/setup-notice";
import { routes } from "@/lib/site";
import { safeRedirectPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Log in" };

const linkErrors: Record<string, string> = {
  link_expired: "That link has expired. Log in, or use “Forgot password?” if you need help getting in.",
  link_invalid: "That link didn't work — it may have already been used. Try logging in.",
  link_other_browser:
    "That link opened in a different browser from the one it was requested in, so it couldn't sign you in. Try logging in, or use “Forgot password?” if you need help getting in.",
  not_configured: "Accounts aren't available yet — Supabase hasn't been configured.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  const errorKey = typeof params.error === "string" ? params.error : undefined;

  return (
    <>
      <AuthHeading title="Welcome back." description="Log in to pick up your routine where you left it." />
      <SetupNotice />
      <LoginForm next={next} initialError={errorKey ? linkErrors[errorKey] : undefined} />
      <AuthFooter>
        New to Assume?{" "}
        <Link href={routes.signup} className="font-semibold text-ink underline decoration-2 underline-offset-4 hover:text-accent-ink">
          Create an account
        </Link>
      </AuthFooter>
    </>
  );
}

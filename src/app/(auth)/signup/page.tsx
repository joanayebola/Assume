import type { Metadata } from "next";
import Link from "next/link";

import { AuthFooter, AuthHeading } from "@/components/auth/auth-card";
import { SetupNotice } from "@/components/auth/setup-notice";
import { SignupForm } from "@/components/auth/signup-form";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <>
      <AuthHeading
        title="Let's build your routine."
        description="Create an account first, so your plan is saved and yours to edit whenever life changes."
      />
      <SetupNotice />
      <SignupForm />
      <AuthFooter>
        Already have an account?{" "}
        <Link href={routes.login} className="font-semibold text-ink underline decoration-2 underline-offset-4 hover:text-accent-ink">
          Log in
        </Link>
      </AuthFooter>
    </>
  );
}

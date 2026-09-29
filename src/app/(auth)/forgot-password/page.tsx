import type { Metadata } from "next";
import Link from "next/link";

import { AuthFooter, AuthHeading } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { SetupNotice } from "@/components/auth/setup-notice";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Forgot your password?"
        description="Enter the email you signed up with and we'll send you a link to choose a new one."
      />
      <SetupNotice />
      <ForgotPasswordForm />
      <AuthFooter>
        Remembered it?{" "}
        <Link href={routes.login} className="font-semibold text-ink underline decoration-2 underline-offset-4 hover:text-accent-ink">
          Back to log in
        </Link>
      </AuthFooter>
    </>
  );
}

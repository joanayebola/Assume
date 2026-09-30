import type { Metadata } from "next";
import Link from "next/link";

import { AuthFooter, AuthHeading } from "@/components/auth/auth-card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getCurrentUser } from "@/lib/auth/session";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The recovery link signs the user in via /auth/callback before landing here.
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <AuthHeading title="This link has expired." />
        <Notice tone="info" className="mb-6">
          Password reset links work once and expire after a short while. Our support team can reset your
          password for you.
        </Notice>
        <ButtonLink href={routes.forgotPassword} size="lg" block>
          Get help resetting it
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title="Choose a new password."
        description={
          <>
            For <span className="font-semibold text-ink">{user.email}</span>
          </>
        }
      />
      <UpdatePasswordForm />
      <AuthFooter>
        Changed your mind?{" "}
        <Link href={routes.appHome} className="font-semibold text-ink underline decoration-2 underline-offset-4 hover:text-accent-ink">
          Go to my home
        </Link>
      </AuthFooter>
    </>
  );
}

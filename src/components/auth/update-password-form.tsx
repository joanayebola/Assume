"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PasswordField } from "@/components/ui/password-field";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { updatePassword } from "@/lib/actions/auth";
import { routes } from "@/lib/site";
import { updatePasswordSchema, type UpdatePasswordInput } from "@/lib/validation/auth";

export function UpdatePasswordForm() {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { feedback, run } = useActionFeedback(setError);

  if (feedback?.tone === "success") {
    return (
      <div className="space-y-5">
        <Notice tone="success" title="Password updated.">
          You&apos;re still signed in on this device.
        </Notice>
        <ButtonLink href={routes.appHome} size="lg" block iconRight={<ArrowRight aria-hidden />}>
          Go to my home
        </ButtonLink>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        const result = await run(() => updatePassword(values));
        if (result?.ok) reset();
      })}
      noValidate
      className="space-y-5"
    >
      {feedback?.tone === "error" && <Notice tone="error">{feedback.message}</Notice>}

      <PasswordField
        label="New password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.password?.message}
        {...register("password")}
      />
      <PasswordField
        label="Confirm new password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <Button type="submit" size="lg" block loading={isSubmitting} loadingText="Saving…">
        Save new password
      </Button>
    </form>
  );
}

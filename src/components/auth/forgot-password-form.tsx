"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { requestPasswordReset } from "@/lib/actions/auth";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { feedback, run } = useActionFeedback(setError);

  return (
    <form
      onSubmit={handleSubmit((values) => run(() => requestPasswordReset(values)))}
      noValidate
      className="space-y-5"
    >
      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}

      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register("email")}
      />

      <Button type="submit" size="lg" block loading={isSubmitting} loadingText="Sending…">
        {feedback?.tone === "success" ? "Send it again" : "Send reset link"}
      </Button>
    </form>
  );
}

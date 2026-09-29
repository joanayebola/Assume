"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PasswordField } from "@/components/ui/password-field";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { signUp } from "@/lib/actions/auth";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";

export function SignupForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });
  const { feedback, run } = useActionFeedback(setError);

  if (feedback?.tone === "success") {
    return (
      <div className="rounded-lg border-2 border-ink bg-surface p-6 shadow-hard-md animate-pop" role="status">
        <span className="grid size-12 place-items-center rounded-md border-2 border-ink bg-accent">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h2 className="mt-5 text-display-sm font-bold">Check your inbox.</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">{feedback.message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((values) => run(() => signUp(values, Intl.DateTimeFormat().resolvedOptions().timeZone)))} noValidate className="space-y-5">
      {feedback?.tone === "error" && <Notice tone="error">{feedback.message}</Notice>}

      <TextField
        label="What should we call you?"
        autoComplete="given-name"
        placeholder="Your first name"
        error={errors.displayName?.message}
        {...register("displayName")}
      />
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
      <PasswordField
        label="Password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.password?.message}
        {...register("password")}
      />

      <Button
        type="submit"
        size="lg"
        block
        loading={isSubmitting}
        loadingText="Creating your account…"
        iconRight={<ArrowRight aria-hidden />}
      >
        Create my account
      </Button>
    </form>
  );
}

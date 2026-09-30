"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PasswordField } from "@/components/ui/password-field";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { resendConfirmation, signIn } from "@/lib/actions/auth";
import { routes } from "@/lib/site";
import { signInSchema, type SignInInput } from "@/lib/validation/auth";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", next },
  });
  const { feedback, run } = useActionFeedback(setError);
  const message = feedback?.message ?? initialError;
  const [resend, setResend] = useState<{ state: "idle" | "sending" | "done"; message?: string; tone?: "success" | "error" }>({
    state: "idle",
  });

  const onResend = async () => {
    setResend({ state: "sending" });
    try {
      const result = await resendConfirmation({ email: getValues("email") });
      setResend({ state: "done", message: result.message ?? "Sent.", tone: result.ok ? "success" : "error" });
    } catch {
      setResend({ state: "done", message: "We couldn't reach the server. Try again.", tone: "error" });
    }
  };

  return (
    <form onSubmit={handleSubmit((values) => run(() => signIn({ ...values, next })))} noValidate className="space-y-5">
      {message && (
        <Notice tone="error">
          {message}
          {feedback?.reason === "email_not_confirmed" && resend.state !== "done" && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              loading={resend.state === "sending"}
              loadingText="Sending…"
              onClick={onResend}
            >
              Resend confirmation email
            </Button>
          )}
        </Notice>
      )}
      {resend.state === "done" && resend.message && <Notice tone={resend.tone}>{resend.message}</Notice>}

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
        autoComplete="current-password"
        error={errors.password?.message}
        labelAside={
          <Link
            href={routes.forgotPassword}
            className="text-sm font-semibold text-accent-ink underline decoration-2 underline-offset-4 hover:text-ink"
          >
            Forgot password?
          </Link>
        }
        {...register("password")}
      />

      <Button
        type="submit"
        size="lg"
        block
        loading={isSubmitting}
        loadingText="Logging in…"
        iconRight={<ArrowRight aria-hidden />}
      >
        Log in
      </Button>
    </form>
  );
}

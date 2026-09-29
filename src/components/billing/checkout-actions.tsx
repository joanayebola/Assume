"use client";

import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { beginCheckout } from "@/lib/actions/billing";
import { submitIntake } from "@/lib/actions/intake";
import { routes } from "@/lib/site";

function isRedirect(error: unknown) {
  return Boolean(error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT"));
}

/** "Continue to payment" → server creates the checkout, then redirects to Dodo. */
export function CheckoutButton({ intakeId, label }: { intakeId: string | null; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await beginCheckout(intakeId); // redirects on success
      if (r && !r.ok) setError(r.message);
    } catch (e) {
      if (isRedirect(e)) throw e;
      setError("We couldn't reach the server. Check your connection — you haven't been charged.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button size="lg" block onClick={go} loading={busy} loadingText="Opening secure checkout…" iconLeft={<Lock aria-hidden />}>
        {label}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/**
 * Submits the intake (which uses the credit) and follows the redirect to the
 * generating screen. With `auto`, it starts on its own — used right after payment.
 */
export function BuildRoutineButton({ intakeId, auto = false }: { intakeId: string; auto?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(auto);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await submitIntake(intakeId); // redirects on success
      if (!r || r.ok) return;
      if (r.code === "incomplete") return router.push(`${routes.newPlan}/${intakeId}?step=${r.step ?? "review"}`);
      if (r.code === "payment_required") return router.push(`${routes.checkout}?intake=${intakeId}`);
      setError(r.message);
      setBusy(false);
    } catch (e) {
      if (isRedirect(e)) throw e;
      setError("We couldn't reach the server. Your answers and payment are safe — try again.");
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!auto || started.current) return;
    // Mark as started only when the timer fires: a cleanup (Strict Mode,
    // fast unmount) must be able to cancel it and let the next run retry.
    const t = setTimeout(() => {
      started.current = true;
      void build();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [auto]);

  return (
    <div className="space-y-3">
      <Button size="lg" block onClick={build} loading={busy} loadingText="Starting your routine…" iconLeft={<Sparkles aria-hidden />} iconRight={<ArrowRight aria-hidden />}>
        Build my routine
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** While a payment is confirming: re-check every few seconds, then explain. */
export function ConfirmPoller() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const done = tries >= 20;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, 3000);
    return () => clearTimeout(t);
  }, [tries, done, router]);

  if (!done) return null;
  return (
    <Notice tone="info" title="This is taking longer than usual">
      Payments sometimes take a minute or two to confirm. You can leave this page — your routine credit appears in Settings → Billing as
      soon as it does, and you can build your routine from Home.
    </Notice>
  );
}

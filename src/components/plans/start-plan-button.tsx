"use client";

import { ArrowRight } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";
import { startIntake } from "@/lib/actions/intake";

function Submit({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingText="Starting…" iconRight={<ArrowRight aria-hidden />} {...props}>
      {children}
    </Button>
  );
}

/** Creates a new intake and opens the flow. */
export function StartPlanButton({ children = "Start my plan", ...props }: ButtonProps) {
  return (
    <form action={startIntake}>
      <Submit {...props}>{children}</Submit>
    </form>
  );
}

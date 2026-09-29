"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

function SubmitButton({ compact }: { compact?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={compact ? "ghost" : "secondary"}
      size="sm"
      block={!compact}
      loading={pending}
      loadingText="Signing out…"
      iconLeft={<LogOut aria-hidden />}
    >
      Sign out
    </Button>
  );
}

export function SignOutButton({ compact }: { compact?: boolean }) {
  return (
    <form action={signOut}>
      <SubmitButton compact={compact} />
    </form>
  );
}

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Container({
  className,
  size = "default",
  ...props
}: ComponentProps<"div"> & { size?: "default" | "narrow" | "wide" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-gutter sm:px-6 lg:px-gutter-lg",
        size === "narrow" && "max-w-3xl",
        size === "default" && "max-w-6xl",
        size === "wide" && "max-w-7xl",
        className,
      )}
      {...props}
    />
  );
}

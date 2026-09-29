import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ["hard-xs", "hard-sm", "hard-md", "hard-lg", "hard-xl", "hard-accent"] }],
      "font-size": [{ text: ["display-xl", "display-lg", "display-md", "display-sm"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** First letter of up to two words — used for avatar monograms. */
export function initials(name: string | null | undefined, fallback = "A") {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return letters || fallback;
}

/**
 * Only allow same-origin relative paths as post-auth redirect targets,
 * so `?next=` can't be abused as an open redirect.
 */
export function safeRedirectPath(value: unknown, fallback = "/home"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}

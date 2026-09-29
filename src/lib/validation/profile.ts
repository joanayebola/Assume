import { z } from "zod";

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: "Your name can't be empty." })
    .max(80, { error: "Keep it under 80 characters." }),
  timezone: z
    .string()
    .min(1, { error: "Choose a timezone." })
    .refine(isValidTimeZone, { error: "Choose a valid timezone." }),
});

export type ProfileInput = z.infer<typeof profileSchema>;

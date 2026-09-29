import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, { error: "Enter your email address." })
  .pipe(z.email({ error: "That doesn't look like an email address." }));

const newPassword = z
  .string()
  .min(8, { error: "Use at least 8 characters." })
  .max(72, { error: "Keep it under 72 characters." });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password." }),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: "Add a name so we know what to call you." })
    .max(80, { error: "Keep it under 80 characters." }),
  email,
  password: newPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const updatePasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(1, { error: "Confirm your new password." }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

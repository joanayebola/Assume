"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LocateFixed } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { updateProfile } from "@/lib/actions/profile";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";

export function ProfileForm({
  defaultValues,
  timezones,
}: {
  defaultValues: ProfileInput;
  timezones: string[];
}) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  });
  const { feedback, setFeedback, run } = useActionFeedback(setError);

  function applyDeviceTimezone() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && timezones.includes(tz)) {
      setValue("timezone", tz, { shouldDirty: true, shouldValidate: true });
      setFeedback(null);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        const result = await run(() => updateProfile(values));
        if (result?.ok) reset(values);
      })}
      noValidate
      className="space-y-5"
    >
      {feedback && <Notice tone={feedback.tone}>{feedback.message}</Notice>}

      <TextField
        label="Name"
        autoComplete="given-name"
        error={errors.displayName?.message}
        {...register("displayName")}
      />

      <SelectField
        label="Timezone"
        hint="Used to place your sessions at the right time of day on your calendar."
        error={errors.timezone?.message}
        {...register("timezone")}
      >
        {timezones.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replaceAll("_", " ")}
          </option>
        ))}
      </SelectField>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={applyDeviceTimezone} iconLeft={<LocateFixed aria-hidden />}>
          Use this device&apos;s timezone
        </Button>
        <Button type="submit" loading={isSubmitting} loadingText="Saving…" disabled={!isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

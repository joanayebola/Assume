import { STEP_KEYS, type StepKey } from "@/lib/intake/model";
import { cn } from "@/lib/utils";

/** Segmented progress: done = ink, current = accent, upcoming = outline. */
export function IntakeProgress({ current, completed }: { current: StepKey; completed: StepKey[] }) {
  const index = STEP_KEYS.indexOf(current);
  return (
    <div
      role="progressbar"
      aria-label="Plan progress"
      aria-valuemin={1}
      aria-valuemax={STEP_KEYS.length}
      aria-valuenow={index + 1}
      aria-valuetext={`Step ${index + 1} of ${STEP_KEYS.length}`}
      className="flex gap-1"
    >
      {STEP_KEYS.map((key, i) => (
        <span
          key={key}
          className={cn(
            "h-2 flex-1 rounded-[1px] border-ink transition-colors duration-300",
            i === index
              ? "border-2 bg-accent"
              : completed.includes(key) || i < index
                ? "border-2 bg-ink"
                : "border-2 border-ink/20 bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

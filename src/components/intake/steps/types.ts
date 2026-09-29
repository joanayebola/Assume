import type { IntakeSections, SectionKey } from "@/lib/intake/model";
import type { Issues } from "@/lib/intake/schema";

export type StepProps<K extends SectionKey> = {
  value: IntakeSections[K];
  onChange: (next: IntakeSections[K]) => void;
  /** Only populated after the user has tried to continue. */
  issues: Issues;
};

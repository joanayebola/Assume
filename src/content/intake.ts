import type {
  AffirmationMode,
  CommitmentKind,
  Overlap,
  OverlapTechnique,
  RoutineStyle,
  StepKey,
  Technique,
  TechniquePreference,
  TimeBudget,
  Weekday,
} from "@/lib/intake/model";

export const stepMeta: Record<StepKey, { label: string; summary: string }> = {
  desire: { label: "Your desire", summary: "What you're manifesting and what having it looks like." },
  affirmations: { label: "Affirmations", summary: "Use your own, get help writing some, or skip them." },
  methods: { label: "Methods", summary: "What you love, what's fine, and what to leave out." },
  day: { label: "Your day", summary: "When you wake, sleep, and what fills the hours between." },
  intensity: { label: "Time & style", summary: "How much time, how much structure." },
  context: { label: "Context", summary: "Any relevant date, and anything else we should know." },
  review: { label: "Review", summary: "Check everything before we build." },
};

/** The New Plan intro lists the data steps (review is implied). */
export const intakeOverview = (["desire", "affirmations", "methods", "day", "intensity", "context"] as const).map(
  (key) => ({ key, title: stepMeta[key].label, summary: stepMeta[key].summary }),
);

export const desireExamples = [
  "a loving relationship with my SP",
  "£20,000",
  "my dream apartment",
  "getting accepted into my first-choice university",
];

export const affirmationModeOptions: { value: AffirmationMode; label: string; description: string }[] = [
  { value: "own", label: "Yes, I'll add mine", description: "Use the words that already feel right." },
  { value: "generate", label: "No, help me create some", description: "We'll write a few when we build your routine." },
  { value: "none", label: "I don't want to use affirmations", description: "They won't appear in your routine." },
];

export const techniqueInfo: Record<Technique, { label: string; description: string }> = {
  affirmations: { label: "Affirmations", description: "Statements you repeat as already true." },
  askfirmations: { label: "Askfirmations", description: "Questions that assume it's done — “why was it so easy?”" },
  visualization: { label: "Visualization", description: "Seeing and feeling a scene from the end." },
  sats: { label: "SATS", description: "A short scene held as you drift off to sleep." },
  scripting: { label: "Scripting", description: "Writing as though it has already happened." },
  subliminals: { label: "Subliminals", description: "Listening to audio with embedded affirmations." },
  inner_conversations: { label: "Inner conversations", description: "Imagined conversations that imply it's done." },
  revision: { label: "Revision", description: "Replaying a moment the way you'd have liked it." },
  meditation: { label: "Meditation / quiet assumption", description: "Quiet time resting in the feeling." },
  other: { label: "Other", description: "Something not on this list." },
};

export const preferenceOptions: { value: TechniquePreference; label: string; short: string }[] = [
  { value: "love", label: "Love it", short: "Love" },
  { value: "fine", label: "Fine with it", short: "Fine" },
  { value: "avoid", label: "Don't give me this", short: "Skip" },
];

export const commitmentKinds: Record<CommitmentKind, { label: string; defaultDays: Weekday[] }> = {
  work: { label: "Work", defaultDays: [1, 2, 3, 4, 5] },
  school: { label: "School", defaultDays: [1, 2, 3, 4, 5] },
  commute: { label: "Commute", defaultDays: [1, 2, 3, 4, 5] },
  gym: { label: "Gym", defaultDays: [] },
  class: { label: "Class", defaultDays: [] },
  childcare: { label: "Childcare", defaultDays: [] },
  other: { label: "Other", defaultDays: [] },
};

/**
 * Suggested answers to "Could you comfortably manifest during this time?".
 * Pre-selected so the common case is one tap, but always the user's call.
 * `null` means we don't guess (work and "other" vary too much).
 */
export const overlapDefaults: Record<CommitmentKind, { overlap: Overlap | null; techniques: OverlapTechnique[]; hint?: string }> = {
  work: { overlap: null, techniques: [], hint: "Some people affirm during repetitive tasks; others need full focus. Your call." },
  school: { overlap: "no", techniques: [] },
  commute: {
    overlap: "some",
    techniques: ["affirmations", "askfirmations", "subliminals", "inner_conversations"],
    hint: "If you drive, only choose things you can do safely with your eyes on the road.",
  },
  gym: { overlap: "some", techniques: ["affirmations", "askfirmations", "subliminals"] },
  class: { overlap: "no", techniques: [] },
  childcare: { overlap: "no", techniques: [] },
  other: { overlap: null, techniques: [] },
};

export const overlapOptions: { value: Overlap; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "some", label: "For some things" },
  { value: "no", label: "No" },
];

export const weekdays: { value: Weekday; short: string; long: string }[] = [
  { value: 1, short: "M", long: "Monday" },
  { value: 2, short: "T", long: "Tuesday" },
  { value: 3, short: "W", long: "Wednesday" },
  { value: 4, short: "T", long: "Thursday" },
  { value: 5, short: "F", long: "Friday" },
  { value: 6, short: "S", long: "Saturday" },
  { value: 7, short: "S", long: "Sunday" },
];

export const timeBudgetOptions: { value: TimeBudget; label: string }[] = [
  { value: "5_10", label: "5–10 minutes" },
  { value: "15_30", label: "15–30 minutes" },
  { value: "30_60", label: "30–60 minutes" },
  { value: "60_plus", label: "More than an hour" },
  { value: "custom", label: "Custom" },
];

export const routineStyleOptions: { value: RoutineStyle; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "A couple of intentional moments. Keep it easy." },
  { value: "balanced", label: "Balanced", description: "A few sessions spread naturally through my day." },
  { value: "structured", label: "Structured", description: "Give my practice clear times and structure." },
  { value: "hourly", label: "Hourly", description: "I want something scheduled throughout the day." },
  { value: "custom", label: "Custom", description: "I'll explain what I want." },
];

export const typicalDayExample =
  "I work 9–5 Monday to Friday. I leave home at 8, commute for about 45 minutes, have lunch around 1, gym Monday/Wednesday/Friday around 6 and I'm usually free after 8.";

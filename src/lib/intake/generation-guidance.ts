/**
 * Product rules for routine generation, written for the model that builds
 * routines from an IntakeSnapshotV2 (Phase 3). Kept here, next to the
 * snapshot shape, so the data and the rules that interpret it change together.
 */

export const SCHEDULE_OVERLAP_GUIDANCE = `
Treat schedule activities as context, not automatically as blocked time. Each commitment records whether manifestation can overlap with it (schedule.commitments[].manifestationOverlap) and, when applicable, which techniques the user is comfortable doing during it.

- availability "yes": the user is comfortable manifesting during this activity; choose techniques that suit it.
- availability "some": only use the listed techniques during this activity.
- availability "no": do not schedule practice during this activity.

A commute, walk, gym session, housework, or repetitive task may be an ideal opportunity for affirmations, askfirmations, subliminals, or inner conversations. Work, school, childcare, meetings, driving, and other activities may or may not permit particular techniques depending on the user's preference and safety.

Never infer that an occupied time is unavailable solely because another activity is occurring. Never schedule techniques that would distract the user from driving or another safety-critical activity.
`.trim();

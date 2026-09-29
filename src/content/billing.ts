/** Product copy for the paid routine. Prices live in src/lib/billing/config.ts (env), never here. */

export const routineOffer = {
  name: "Your personalised routine",
  summary: "Built from your answers, around the week you actually have.",
  includes: [
    "A routine fitted to your real schedule — commutes, shifts and all",
    "Only the techniques you like; none you asked to skip",
    "Adjust it, edit any session or regenerate one whenever life changes",
    "Add it to Apple or Google Calendar, with private event titles",
    "A one-time purchase — no subscription",
  ],
  reassurance: "Your answers are saved either way. Payment is handled securely by Dodo Payments; Assume never sees your card.",
} as const;

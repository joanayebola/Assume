import type { TimelineItem } from "@/components/routine/routine-timeline";

/**
 * Illustrative content for the marketing site. These are clearly framed as
 * examples on the page — not real users, testimonials or statistics.
 */

export const heroRoutine: TimelineItem[] = [
  {
    kind: "practice",
    time: "06:50",
    title: "Wake up already there",
    method: "Living in the end",
    minutes: 3,
    note: "before your phone",
  },
  { kind: "life", time: "08:00", title: "Commute", duration: "60 min" },
  {
    kind: "practice",
    time: "08:05",
    title: "Affirmation loop",
    method: "Audio affirmations",
    minutes: 10,
    note: "headphones in",
    highlight: true,
  },
  { kind: "life", time: "09:00", title: "Work", duration: "9–5" },
  { kind: "life", time: "17:45", title: "Gym", duration: "75 min" },
  {
    kind: "practice",
    time: "22:40",
    title: "Fall asleep in the end scene",
    method: "SATS",
    minutes: 8,
    note: "in bed, lights off",
  },
];

export const steps = [
  {
    title: "Tell us what you want.",
    body: "What you're manifesting and what it looks like once it's happened.",
  },
  {
    title: "Tell us what your days look like.",
    body: "Your schedule, plus the methods you love and the ones you can't stand.",
  },
  {
    title: "Get a routine built around you.",
    body: "Sessions that fit the gaps you really have — and go straight to your calendar.",
  },
] as const;

export const exampleInput =
  "I work 9–5, commute for an hour, go to the gym after work and hate scripting.";

export const exampleSignals = [
  "Works 9–5",
  "60-min commute",
  "Gym after work",
  "Skip: scripting",
] as const;

export const exampleRoutine: TimelineItem[] = [
  {
    kind: "practice",
    time: "06:50",
    title: "Two-minute morning assumption",
    method: "Visualization",
    minutes: 2,
  },
  { kind: "life", time: "08:00", title: "Commute", duration: "60 min" },
  {
    kind: "practice",
    time: "08:10",
    title: "Recorded affirmations",
    method: "Audio affirmations",
    minutes: 12,
    highlight: true,
  },
  { kind: "life", time: "09:00", title: "Work", duration: "9–5" },
  { kind: "life", time: "17:45", title: "Gym", duration: "75 min" },
  {
    kind: "practice",
    time: "22:40",
    title: "End-scene before sleep",
    method: "SATS",
    minutes: 8,
  },
];

export const exampleReasons = [
  {
    title: "No scripting.",
    body: "You said you hate it, so it's gone.",
  },
  {
    title: "The commute does the work.",
    body: "Listening needs no desk, so the longest session lives there.",
  },
  {
    title: "Work stays work.",
    body: "You said you can't practise at your desk, so nothing lands there.",
  },
] as const;

export const faqs = [
  {
    q: "Does Assume guarantee my manifestation will happen?",
    a: "No. Assume is a planning tool. It helps you build a consistent practice that suits your life and your preferences. It doesn't promise outcomes, and we don't make scientific claims about manifestation.",
  },
  {
    q: "Do I need to know which methods to use?",
    a: "Not at all. Tell us what appeals to you and what doesn't. If you're unsure, Assume suggests a mix of simple approaches — and you can swap any of them out.",
  },
  {
    q: "Can I use my own affirmations?",
    a: "Yes. Bring the affirmations you already use, ask Assume to write some for you, or do both.",
  },
  {
    q: "What happens if I miss a session?",
    a: "You missed a session — that's all. There are no streaks to break and no guilt trips. Nothing about Assume suggests a skipped day undoes anything. Your routine is simply there when you come back.",
  },
  {
    q: "Which calendars does it work with?",
    a: "Assume creates standard calendar events, so your routine can go into Google Calendar, Apple Calendar, Outlook and most other calendar apps.",
  },
  {
    q: "Who can see what I share?",
    a: "Your plans are private to your account. To build your routine, your answers are sent to an AI model that generates it.",
  },
] as const;

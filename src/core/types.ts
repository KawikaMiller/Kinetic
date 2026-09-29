import type { ComponentType, ReactNode } from 'react';

export type TierNumber = 1 | 2 | 3 | 4;
export type TrackId = 'dsa' | 'net' | 'arch' | 'data' | 'os' | 'sec' | 'ops';

export interface Tier {
  n: TierNumber;
  name: string;
  role: string;
  color: string;
  blurb: string;
}

export interface Track {
  id: TrackId;
  name: string;
  short: string;
  color: string;
  glyph: string;
}

export interface Topic {
  id: string;
  tier: TierNumber;
  track: TrackId;
  title: string;
  tagline: string;
  minutes?: number;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

/**
 * The "executive summary" shown above the visual, so the learner knows what
 * they're looking at and why it matters before anything starts moving.
 * Keep every field short: this is context, not a textbook chapter.
 */
export interface LessonSummary {
  /** One sentence. If they read nothing else, they read this. */
  tldr: string;
  /** 2-3 plain-English sentences: what the concept actually is. */
  what: string;
  /** Optional everyday analogy that makes it click. */
  analogy?: string;
  /** 3-4 concrete places this shows up in real systems. */
  useCases: string[];
  /** Why an engineer at this tier needs it: jobs, interviews, outages. */
  why: string;
  /** How to read the visual: what the colours and shapes mean. */
  watch: string;
}

/** What every file in src/lessons/<id>/index.tsx default-exports. */
export interface LessonModule {
  summary: LessonSummary;
  /** Short prompts nudging the learner to poke at the visual. */
  tryThis: string[];
  /** 3-4 one-liners worth remembering. */
  keyIdeas: string[];
  quiz: QuizQuestion[];
  /** The interactive visual. Usually built from <StageFrame>. */
  Stage: ComponentType;
}

/** One step of a step-through animation. Lessons extend this with their own state. */
export interface Frame {
  /** Caption shown under the stage while this frame is on screen. */
  say?: ReactNode;
  /** Multiplier on how long autoplay lingers on this frame (default 1). */
  hold?: number;
}

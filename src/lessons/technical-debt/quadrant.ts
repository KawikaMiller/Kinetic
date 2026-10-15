/**
 * Scene 3: six invented scenarios sorted into a four-box debt quadrant (deliberate or
 * inadvertent, reckless or prudent). The quadrant is one person's framework, popularly
 * credited to Martin Fowler and written here from memory, and the key is the lesson's opinion.
 */
import type { Tone } from '../../core/tone';

export type BoxId = 'deliberate-reckless' | 'deliberate-prudent' | 'inadvertent-reckless' | 'inadvertent-prudent';

export interface Box {
  id: BoxId;
  label: string;
  /** A plain category: never a status colour. */
  tone: Tone;
}

export const BOXES: readonly Box[] = [
  { id: 'deliberate-reckless', label: 'Deliberate and reckless', tone: 'orange' },
  { id: 'deliberate-prudent', label: 'Deliberate and prudent', tone: 'amber' },
  { id: 'inadvertent-reckless', label: 'Inadvertent and reckless', tone: 'pink' },
  { id: 'inadvertent-prudent', label: 'Inadvertent and prudent', tone: 'sky' },
];

export const boxOf = (id: BoxId): Box => BOXES.find((b) => b.id === id)!;

export interface Card {
  id: string;
  text: string;
  /** The boxes the key accepts: one, or two for an arguable card. */
  accepts: readonly [BoxId] | readonly [BoxId, BoxId];
  /** Why the key says so, in the lesson's own words. */
  why: string;
}

export const CARDS: readonly Card[] = [
  {
    id: 'demo',
    text: 'To hit a demo date the team skips input validation and writes no ticket to come back to it.',
    accepts: ['deliberate-reckless'],
    why: 'They knew it was a shortcut, and nothing records or prices it: nobody can decide later whether to pay it.',
  },
  {
    id: 'pilot',
    text: 'The team ships a simple version to learn from real users, logs a ticket and a review date to rework it.',
    accepts: ['deliberate-prudent'],
    why: 'The shortcut was chosen with open eyes, the cost is written down and a date is set to decide again.',
  },
  {
    id: 'layers',
    text: 'A new hire nobody has onboarded puts database queries inside the button handlers, and it ships unreviewed.',
    accepts: ['inadvertent-reckless'],
    why: 'Nobody chose it, and the missing review and onboarding are what let it through.',
  },
  {
    id: 'model',
    text: 'After a year of real use the team finally understands the domain and sees that the data model they built has the wrong shape.',
    accepts: ['inadvertent-prudent'],
    why: 'Careful work with what they knew then; the debt only became visible once they learned more.',
  },
  {
    id: 'snippet',
    text: 'To get unstuck the team pastes a snippet it only half understands and plans to revisit it "sometime".',
    accepts: ['deliberate-reckless', 'deliberate-prudent'],
    why: 'It is deliberate either way. It leans reckless if "sometime" is not written anywhere and prudent if the risk and a date are on the board. The story does not say, so both boxes are accepted.',
  },
  {
    id: 'library',
    text: 'A library the team chose was fine, then its maintainers moved on, and nobody noticed for two years.',
    accepts: ['inadvertent-reckless', 'inadvertent-prudent'],
    why: 'Nobody chose the debt. Whether it counts as reckless depends on whether anyone was meant to watch dependencies, which the story does not say, so both boxes are accepted.',
  },
];

export type Placements = Readonly<Record<string, BoxId | undefined>>;

/** A card the key accepts in two boxes. */
export const isArguable = (c: Card) => c.accepts.length === 2;

/** Is the learner's box one the key accepts for this card? */
export const matchesKey = (c: Card, box: BoxId | undefined): boolean => box !== undefined && (c.accepts as readonly BoxId[]).includes(box);

/** How many cards the learner has placed in a box the key accepts. */
export const matches = (placements: Placements): number => CARDS.filter((c) => matchesKey(c, placements[c.id])).length;

/** How many cards have been placed anywhere. */
export const placed = (placements: Placements): number => CARDS.filter((c) => placements[c.id] !== undefined).length;

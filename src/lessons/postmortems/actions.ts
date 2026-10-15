/**
 * Scene 3: action items built from slots, and the checklist computed over them. An action item is a
 * choice from authored lists, so there is no typed text to parse; an empty slot is incomplete and never passes.
 */
import { LEAF_IDS } from './tree';

export type Tag = 'prevent' | 'detect' | 'mitigate';
export const TAGS: readonly Tag[] = ['prevent', 'detect', 'mitigate'];
export const TAG_LETTER: Record<Tag, string> = { prevent: 'P', detect: 'D', mitigate: 'M' };

export interface WhatOption {
  id: string;
  text: string;
  /** The leaf factors it addresses: empty for an item that points at nothing. */
  covers: readonly string[];
  /** What the action does, by the usual meaning of each tag. */
  tag: Tag;
}

export const WHATS: readonly WhatOption[] = [
  { id: 'range-check', text: 'Reject out-of-range values in the config tool', covers: ['old-schema'], tag: 'prevent' },
  { id: 'preview', text: 'Show the effect of a config change in review', covers: ['one-line-review'], tag: 'prevent' },
  { id: 'staged', text: 'Roll config out in stages behind a health gate', covers: ['no-stages', 'shared-file'], tag: 'mitigate' },
  { id: 'alert-window', text: 'Alert on the error ratio with a shorter window', covers: ['noisy-history'], tag: 'detect' },
  { id: 'one-step-rollback', text: 'Add a one-step config rollback', covers: ['manual-revert'], tag: 'mitigate' },
  { id: 'runbook', text: 'Update the config runbook and link it from the alert', covers: ['stale-runbook'], tag: 'mitigate' },
  { id: 'careful', text: 'Be more careful with config changes', covers: [], tag: 'prevent' },
  { id: 'retrain', text: 'Retrain the engineer who made the change', covers: [], tag: 'prevent' },
];

export interface DoneOption {
  id: string;
  text: string;
  /** Can someone check it, without asking how people feel? */
  verifiable: boolean;
}

export const DONES: readonly DoneOption[] = [
  { id: 'ci-test', text: 'A test in CI rejects the bad value', verifiable: true },
  { id: 'drill', text: 'A drill reverts a bad change and is timed', verifiable: true },
  { id: 'replay', text: 'The alert fires in a replay of this incident', verifiable: true },
  { id: 'next-changes', text: 'Staged rollout is used for the next ten config changes', verifiable: true },
  { id: 'reminded', text: 'Everyone has been reminded', verifiable: false },
  { id: 'confident', text: 'The team feels confident', verifiable: false },
];

export const OWNERS: readonly string[] = ['Config platform team', 'Release engineering', 'On-call rota owner', 'Service tech lead'];

export interface Item {
  id: number;
  what: string | null;
  owner: string | null;
  done: string | null;
  tag: Tag | null;
}

const whatOf = (id: string | null) => WHATS.find((w) => w.id === id);
const doneOf = (id: string | null) => DONES.find((d) => d.id === id);

export const isComplete = (i: Item): boolean => i.what !== null && i.owner !== null && i.tag !== null && doneOf(i.done)?.verifiable === true;

export interface Check {
  id: 'coverage' | 'complete' | 'concrete' | 'mix' | 'tags';
  label: string;
  pass: boolean;
  detail: string;
}

/** The checklist over a list of items. Computed by walking the leaves and the items, never by the tree code. */
export function checklist(items: readonly Item[]): Check[] {
  const uncovered = LEAF_IDS.filter((leaf) => !items.some((i) => whatOf(i.what)?.covers.includes(leaf)));
  const incomplete = items.filter((i) => !isComplete(i));
  const vague = items.filter((i) => (whatOf(i.what)?.covers.length ?? 0) === 0);
  const tagged = items.filter((i) => i.tag !== null);
  const mismatched = items.filter((i) => i.tag !== null && whatOf(i.what) && whatOf(i.what)!.covers.length > 0 && whatOf(i.what)!.tag !== i.tag);
  const concreteTagged = tagged.filter((i) => (whatOf(i.what)?.covers.length ?? 0) > 0);
  const onlyPrevent = tagged.length > 0 && tagged.every((i) => i.tag === 'prevent');
  return [
    {
      id: 'coverage',
      label: 'Every leaf factor has an action',
      pass: items.length > 0 && uncovered.length === 0,
      detail: `${LEAF_IDS.length - uncovered.length} of ${LEAF_IDS.length} leaf factors are addressed`,
    },
    {
      id: 'complete',
      label: 'Every action has an owner role, a tag and a done-when someone can check',
      pass: items.length > 0 && incomplete.length === 0,
      detail: items.length === 0 ? 'no actions yet' : `${items.length - incomplete.length} of ${items.length} actions are complete`,
    },
    {
      id: 'concrete',
      label: 'Every action points at a factor, not at care or a person',
      pass: items.length > 0 && vague.length === 0,
      detail: items.length === 0 ? 'no actions yet' : `${items.length - vague.length} of ${items.length} actions address a leaf factor`,
    },
    {
      id: 'mix',
      label: 'The tags include something that detects or mitigates, not only prevents',
      pass: tagged.length > 0 && !onlyPrevent,
      detail: tagged.length === 0 ? 'no tagged actions yet' : onlyPrevent ? 'every tagged action is prevent' : 'prevent, detect and mitigate are not all prevent',
    },
    {
      id: 'tags',
      label: 'Each tag matches what its action does',
      pass: concreteTagged.length > 0 && mismatched.length === 0,
      detail: mismatched.length === 0 ? 'no mismatches' : `${mismatched.length} ${mismatched.length === 1 ? 'action is' : 'actions are'} tagged against what it does`,
    },
  ];
}

const item = (id: number, what: string, owner: string | null, done: string | null, tag: Tag | null): Item => ({ id, what, owner, done, tag });

export interface Preset {
  id: string;
  label: string;
  items: readonly Item[];
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'good',
    label: 'A good postmortem',
    items: [
      item(1, 'range-check', 'Config platform team', 'ci-test', 'prevent'),
      item(2, 'preview', 'Release engineering', 'ci-test', 'prevent'),
      item(3, 'staged', 'Release engineering', 'next-changes', 'mitigate'),
      item(4, 'alert-window', 'On-call rota owner', 'replay', 'detect'),
      item(5, 'one-step-rollback', 'Config platform team', 'drill', 'mitigate'),
      item(6, 'runbook', 'On-call rota owner', 'drill', 'mitigate'),
    ],
  },
  { id: 'careful', label: '"Be more careful"', items: [item(1, 'careful', null, null, null)] },
  { id: 'person', label: 'A chain of whys that ends at a person', items: [item(1, 'retrain', 'Service tech lead', 'reminded', 'prevent')] },
];

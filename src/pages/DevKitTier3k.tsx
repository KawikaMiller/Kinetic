import { useState } from 'react';
import { ClassifyBoard, type ClassifyCategory, type ClassifyItem } from '../components/ClassifyBoard';
import { SectionTitle } from '../components/Panel';
import { classifyScore, emptyClassify } from '../core/classify';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round, wave 7 to 8, agent K (#/dev/kit). */

const CATEGORIES: ClassifyCategory[] = [
  { id: 'reg', label: 'Regular' },
  { id: 'cf', label: 'Context-free' },
  { id: 'cs', label: 'Context-sensitive' },
];
const ITEMS: ClassifyItem[] = [
  { id: 'ab', label: 'a*b*', explanation: 'Two loops in a row: a finite automaton needs no memory of how many a there were.' },
  { id: 'anbn', label: <em>aⁿbⁿ</em>, text: 'a to the n, b to the n', explanation: 'Needs a counter that is unbounded, which a stack gives and a finite automaton lacks.' },
  { id: 'anbncn', label: <em>aⁿbⁿcⁿ</em>, text: 'a to the n, b to the n, c to the n' },
];
const KEY = { ab: 'reg', anbn: 'cf', anbncn: 'cs' };

function ClassifyDemo() {
  const [board, setBoard] = useState(() => emptyClassify(ITEMS));
  return (
    <>
      <ClassifyBoard items={ITEMS} categories={CATEGORIES} answerKey={KEY} value={board} onChange={setBoard} />
      <p className="mono">{board.checked ? `checked: ${classifyScore(ITEMS, KEY, board.answers)} of ${ITEMS.length}` : 'not checked'} · the score line is the only live region</p>
    </>
  );
}

export function DevKitTier3k() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 7 to 8 round, agent K</SectionTitle>
      <Section title="ClassifyBoard · sort items into 2 to 5 categories (arrows move a row's choice), Check, then Why? where an item has an explanation">
        <ClassifyDemo />
      </Section>
    </>
  );
}

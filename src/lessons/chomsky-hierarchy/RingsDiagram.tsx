import type { ReactNode } from 'react';
import { RINGS, ringIndex, type Card, type RingId } from './languages';

/** Plain category tones for the five rings (colour is not a verdict here). */
const RING_CLASS: Record<RingId, string> = { regular: 'is-amber', cf: 'is-pink', cs: 'is-sky', decidable: 'is-orange', re: 'is-muted' };

/**
 * The five rings as nested boxes, largest outside, with the cards the learner has put in each. After a Check a
 * card chip is green in its right ring and red in a wrong one. Under 600px the nesting flattens to a stack.
 */
export function RingsDiagram({ cards, answers, checked }: { cards: readonly Card[]; answers: Record<string, string | null>; checked: boolean }) {
  const ring = (index: number): ReactNode => {
    const r = RINGS[index];
    const placed = cards.filter((c) => answers[c.id] === r.id);
    return (
      <div key={r.id} className={`ch-ring ${RING_CLASS[r.id]}`}>
        <div className="ch-ring-head">
          <b>{r.label}</b> <span className="ch-ring-type">{r.type}</span>
        </div>
        <div className="ch-ring-cards" aria-label={`${r.label}: ${placed.length} placed`}>
          {placed.map((c) => (
            <span key={c.id} className={`ch-card ${checked ? (ringIndex(c.ring) === index ? 'is-right' : 'is-wrong') : ''}`}>
              {c.label}
            </span>
          ))}
        </div>
        {index > 0 ? ring(index - 1) : null}
      </div>
    );
  };
  return (
    <div className="ch-rings" role="group" aria-label="The five rings, largest outside">
      {ring(RINGS.length - 1)}
    </div>
  );
}

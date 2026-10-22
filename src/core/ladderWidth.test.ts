import { describe, expect, it } from 'vitest';
import { SEQ_NOTE_PX, ladderMinWidth } from './ladderWidth';
import { MIN_TEXT_PX } from './scale';
import { pickLayout, sequenceLayout, type SeqMessage } from './sequenceLayout';

const actors = [{ id: 'a', label: 'Client' }, { id: 'b', label: 'Server' }, { id: 'c', label: 'Peer' }];
const msgs = (note: string): SeqMessage[] => [
  { id: '1', from: 'a', to: 'b', label: 'request with a fairly long label', note },
  { id: '2', from: 'b', to: 'c', label: 'forward it', note },
  { id: '3', from: 'c', to: 'a', label: 'reply', note: 'a short note' },
];

describe('ladderMinWidth', () => {
  it('at the width it returns, the layout SequenceDiagram would pick renders its notes at 8px or more', () => {
    for (const note of ['fits', 'over 1440 with don\'t-fragment', 'after a timeout, the same size again, and again, and once more after that']) {
      const m = msgs(note);
      const roomy = sequenceLayout(actors, m, undefined, { wrapNotes: false });
      const compact = sequenceLayout(actors, m);
      const room = ladderMinWidth(actors, m);
      const picked = pickLayout(roomy, compact, room);
      expect(Math.max(room, picked.minWidth) / picked.width * SEQ_NOTE_PX, note).toBeGreaterThanOrEqual(MIN_TEXT_PX - 1e-9);
    }
  });
  it('the old width, from the 12px labels, was too narrow for the notes', () => {
    const m = msgs('over 1440 with don\'t-fragment');
    const roomy = sequenceLayout(actors, m, undefined, { wrapNotes: false });
    expect(roomy.minWidth / roomy.width * SEQ_NOTE_PX).toBeLessThan(MIN_TEXT_PX);
  });
  it('without notes it adds nothing beyond the layout\'s own minimum', () => {
    const m = msgs('x').map(({ note: _n, ...rest }) => rest);
    const roomy = sequenceLayout(actors, m, undefined, { wrapNotes: false });
    const compact = sequenceLayout(actors, m);
    expect(ladderMinWidth(actors, m)).toBe(Math.max(roomy.minWidth, compact.minWidth));
  });
});

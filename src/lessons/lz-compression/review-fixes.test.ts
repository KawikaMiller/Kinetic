import { describe, expect, it } from 'vitest';
import { MAX_DISTANCE, distanceCode } from './deflate';
import lesson from './index';

describe('numbers the quiz quotes come from the model', () => {
  it('the farthest distance is 32,768 and a distance of 30,000 takes 13 extra bits (hand-worked: its bucket starts at 24,577 and spans 8,192 values)', () => {
    expect(MAX_DISTANCE).toBe(32768);
    expect(distanceCode(30000).extraBits).toBe(13);
    expect(distanceCode(24577 + 8191).code).toBe(distanceCode(30000).code);
    const q = lesson.quiz[1];
    expect(q.why).toContain('13 distance extra bits');
    expect(q.why).toContain('32,768');
    expect(q.q).toContain('30,000 characters back');
    expect(q.q).toContain('three ASCII letters');
  });

  it('nothing on the learner’s screen talks about the repo (Node, zlib by name, core/ paths)', () => {
    const shown = [lesson.summary.watch, ...lesson.quiz.map((q) => `${q.q} ${q.why}`)].join(' ');
    expect(shown).not.toMatch(/Node|core\/huffman/);
  });

  it('watch describes the byte grid colours the legend shows', () => {
    expect(lesson.summary.watch).toContain('yellow is the byte being filled');
  });
});

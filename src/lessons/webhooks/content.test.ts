import { describe, expect, it } from 'vitest';
import lesson from './index';

describe('what the lesson says about timestamps and retries', () => {
  it('says each attempt is signed with its own timestamp, so a legitimate retry is not a replay', () => {
    const w = lesson.summary.what;
    expect(w).toContain('sign each attempt afresh');
    expect(w).toContain('the tolerance applies to the attempt, not to the event');
  });
  it('does not claim a typical provider or a universal retry policy', () => {
    const all = JSON.stringify(lesson);
    expect(all).not.toContain('typical provider');
    expect(lesson.quiz[2].q).toContain('many providers');
  });
});

import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { BIRTHDAY_FACTS, batchCaption, collisionCaption, idCaption, pigeonCaption } from './frames';
import { firstCollision, guaranteed, runSizes } from './model';

describe('captions', () => {
  it('pigeonhole verdict comes from n > m for every slider pair', () => {
    for (let m = 1; m <= 24; m++) {
      for (let n = 1; n <= 30; n++) expect(text(pigeonCaption(n, m)).includes('still gets two')).toBe(guaranteed(n, m));
    }
  });

  it('names the run\'s own shared day and its chance', () => {
    const run = firstCollision(3);
    const c = text(collisionCaption(run, 1));
    expect(c).toContain(`person ${run.days.length} shares`);
    expect(c).toContain(`with person ${run.match + 1}`);
  });

  it('the batch caption computes its median and share from the runs', () => {
    expect(text(batchCaption([20, 22, 30, 40]))).toBe('4 runs so far: the median is 30 people, and 50% of runs found a match by person 23. Nowhere near 183.');
    expect(text(batchCaption(runSizes(1, 2000)))).toMatch(/the median is 2[2-4] people/);
  });

  it('IDs and the birthday facts read the model', () => {
    expect(text(idCaption(77_163, 32))).toContain('chance of a repeat 50%');
    expect(text(idCaption(77_163, 32))).toContain('about 77,163 IDs');
    expect(BIRTHDAY_FACTS).toBe('With 365 days, 366 people guarantee a shared birthday (367 counting Feb 29), but 23 already give 50.73%.');
  });
});

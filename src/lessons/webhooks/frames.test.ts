import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { fastFrames, fastLadder, fastTone, orderFrames, retryCaption, retryLadder, signatureCaption, signatureLadder } from './frames';
import {
  FEED, ORDERINGS, PROVIDER_TIMEOUT_S, TRUTH, deliverAll, fastScript, orderLabel, permutations, receive, scheduleEnd, withDuplicates, type ReplyMode,
} from './model';
import { BODY, SECRET, SIGNED_AT, TOLERANCE_S, inspect, signedDelivery, tamper } from './signature';

const text = (n: Parameters<typeof captionText>[0]) => captionText(n).replace(/\s+/g, ' ');

describe('signature captions, for every body × delivery age', () => {
  for (const edited of [false, true])
    for (let min = 0; min <= 10; min++)
      it(`${edited ? 'edited' : 'untouched'}, ${min} min after signing`, async () => {
        const d = (await signedDelivery())!;
        const r = (await inspect(SECRET, { ...d, body: edited ? tamper(BODY) : BODY }, SIGNED_AT + min * 60))!;
        const t = text(signatureCaption(r, edited));
        const stale = min * 60 > TOLERANCE_S;
        if (edited) {
          expect(t).toContain('Rejected');
          expect(t).toContain(`${r.differing} of 64 hex digits`);
          expect(t).toContain('one-character edit');
          expect(t).not.toContain('stale');
        } else if (stale) {
          expect(t).toContain('Rejected as stale');
          expect(t).toContain(`${min} min old`);
        } else {
          expect(t).toContain('Verified');
          expect(t).toContain(`${min} min old`);
        }
        // The ladder's last message and status agree with the verdict.
        const ladder = signatureLadder(r, edited, min * 60);
        expect(ladder[ladder.length - 1].label).toBe(r.verdict.ok ? '200 OK' : '400 Bad Request');
        expect(ladder[ladder.length - 1].tone).toBe(r.verdict.ok ? 'ok' : 'bad');
        expect(ladder[2].note?.includes('body edited') ?? false).toBe(edited);
        expect(ladder[2].note?.includes(`${min} min old`) ?? false).toBe(min > 0);
      });
});

describe('retry captions', () => {
  it('state the real counts for every recovery time', () => {
    for (let up = 0; up <= scheduleEnd() + 5; up += 1) {
      const all = deliverAll(FEED, up);
      const t = text(retryCaption(all, up));
      const failed = all.reduce((n, d) => n + d.attempts.filter((a) => !a.ok).length, 0);
      if (up === 0) {
        expect(t).toContain('no retries');
        continue;
      }
      expect(t).toContain(`down until minute ${up}`);
      expect(t).toContain(`${failed} attempts fail`);
      const gave = all.filter((d) => d.gaveUp).length;
      expect(t.includes('the provider gives up on all')).toBe(gave === all.length);
      expect(t.includes('Once it is back the backlog drains')).toBe(gave === 0);
    }
  });
  it('the ladder marks failed attempts lost and retries orange, with a 200 only if it got through', () => {
    for (const up of [0, 2, 20, 100, 400]) {
      const d = deliverAll(FEED, up)[0];
      const m = retryLadder(d);
      expect(m.filter((x) => x.lost)).toHaveLength(d.attempts.filter((a) => !a.ok).length);
      expect(m.some((x) => x.label === '200 OK')).toBe(d.deliveredAt !== null);
      expect(m.filter((x) => x.label.includes('retry')).every((x) => x.tone === 'orange')).toBe(true);
    }
  });
});

describe('duplicate and ordering captions, for every order × duplicates × dedupe × strategy', () => {
  for (const order of permutations())
    for (const dup of [false, true])
      for (const dedupe of [false, true])
        for (const { id: ordering } of ORDERINGS)
          it(`${orderLabel(order)}, duplicates ${dup}, dedupe ${dedupe}, ${ordering}`, () => {
            const stream = dup ? withDuplicates(order) : order;
            const steps = receive(stream, { dedupe, ordering });
            const frames = orderFrames(steps, { ordering, dedupe }, 'intro');
            expect(frames).toHaveLength(steps.length + 2);
            frames.slice(1, -1).forEach((f, i) => {
              const s = steps[i];
              const t = text(f.say);
              expect(t.includes('out of order'), `step ${i}`).toBe(s.outOfOrder);
              expect(t.includes('arrives again')).toBe(s.duplicate);
              expect(t.includes('dropped')).toBe(s.action === 'dropped-duplicate');
              expect(t.includes('is older than the last event applied')).toBe(s.action === 'ignored-stale');
              if (s.action === 'applied') expect(t).toContain(s.state!);
              if (s.action === 'applied' && s.effects.length) expect(t.includes('effect:')).toBe(true);
            });
            const end = steps[steps.length - 1];
            const sum = text(frames[frames.length - 1].say);
            expect(sum).toContain(`ends at ${end.state}`);
            expect(sum.includes('A late event overwrote a newer one')).toBe(end.state !== TRUTH);
            const repeats = end.effects.length - new Set(end.effects).size;
            expect(sum.includes('repeated')).toBe(repeats > 0);
            if (repeats > 0) expect(sum).toContain(`${repeats} repeated`);
          });
});

describe('respond-fast captions', () => {
  for (const mode of ['after-work', 'ack-first'] as ReplyMode[])
    for (const w of [1, 5, PROVIDER_TIMEOUT_S, PROVIDER_TIMEOUT_S + 1, 20, 30])
      it(`${mode}, ${w} s of work`, () => {
        const run = fastScript(w, mode);
        const frames = fastFrames(run, w, 'intro');
        expect(frames).toHaveLength(run.steps.length + 2);
        const n = run.workRuns === 1 ? 'once' : run.workRuns === 2 ? 'twice' : `${run.workRuns} times`;
        const sum = text(frames[frames.length - 1].say);
        expect(sum).toContain(run.acked ? 'Retries stopped' : 'still has no 2xx');
        expect(sum).toContain(n);
        run.steps.forEach((s, i) => {
          const t = text(frames[i + 1].say);
          expect(t.includes('never counts')).toBe(s.kind === 'lost-reply');
          if (s.kind === 'work') expect(t).toContain(s.workRuns === 1 ? 'run once' : `run ${s.workRuns === 2 ? 'twice' : `${s.workRuns} times`}`);
          if (s.kind === 'reply') expect(t).toContain('200 OK');
        });
        expect(fastLadder(run)).toHaveLength(run.steps.length);
      });
  it('colours: first attempt blue, retries orange, the stored event violet, a lost reply red, a 2xx green', () => {
    const steps = fastScript(20, 'after-work').steps;
    expect(steps.filter((s) => s.kind === 'post').map(fastTone)).toEqual(['info', 'orange', 'orange']);
    expect(steps.filter((s) => s.kind === 'lost-reply').every((s) => fastTone(s) === 'bad')).toBe(true);
    const fast = fastScript(20, 'ack-first').steps;
    expect(fast.map(fastTone)).toEqual(['info', 'violet', 'ok', 'muted']);
  });
});

import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { buildFrames } from './frames';
import { TOTAL, crashPoints, type Mode } from './model';

const MODES: Mode[] = ['none', 'txn'];
/** Every run a learner can make: no crash, or a crash after any step but the last. */
const RUNS = MODES.flatMap((mode) => [null, ...crashPoints(mode)].map((crashAt) => ({ mode, crashAt, frames: buildFrames(mode, crashAt) })));

describe('every run', () => {
  it('captions every frame', () => {
    for (const { frames } of RUNS) for (const f of frames) expect(text(f.say).length).toBeGreaterThan(0);
  });

  it('only says "done" to the client once it is true, and keeps saying it', () => {
    for (const { frames } of RUNS) {
      const told = frames.findIndex((f) => f.clientTone === 'ok');
      if (told >= 0) for (const f of frames.slice(told)) expect(f.clientTone).toBe('ok');
    }
  });
});

describe('the closing caption matches the run', () => {
  it('with a log: durability names whether the client heard "done"; atomicity states the real total', () => {
    for (const { mode, crashAt, frames } of RUNS) {
      if (mode !== 'txn' || crashAt === null) continue;
      const last = frames.at(-1)!;
      const say = text(last.say);
      expect(last.alice + last.bob).toBe(TOTAL);
      if (say.startsWith('Durability')) {
        if (last.clientTone === 'ok') expect(say).toContain('the client was told "done"');
        else expect(say).toContain('before the client heard "done"');
      } else {
        expect(say).toContain(`the total is still $${TOTAL}`);
        expect(last.clientTone).not.toBe('ok');
      }
    }
  });

  it('without a log: the vanished sum is the real shortfall, and only then are A and C broken', () => {
    for (const { mode, crashAt, frames } of RUNS) {
      if (mode !== 'none' || crashAt === null) continue;
      const last = frames.at(-1)!;
      const short = TOTAL - (last.alice + last.bob);
      if (short > 0) {
        expect(text(last.say)).toContain(`Alice has $${last.alice}, Bob has $${last.bob}. $${short} vanished`);
        expect(last.letters.A).toBe('bad');
      } else {
        expect(text(last.say)).toContain('nothing was half-done');
        expect(last.letters.A).not.toBe('bad');
      }
    }
  });

  it('the recovery caption names the account the log actually touched', () => {
    for (const { mode, crashAt, frames } of RUNS) {
      if (mode !== 'txn' || crashAt === null) continue;
      const step = frames.find((f) => /redone|rolls back|nothing to undo/.test(text(f.say)))!;
      const s = text(step.say);
      if (s.includes('rolls back')) expect(s).toContain('puts Alice back to $500');
      if (s.includes('redone')) expect(s).toContain("Bob's missing write");
    }
  });
});

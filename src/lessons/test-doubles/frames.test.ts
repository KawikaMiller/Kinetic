import { describe, expect, it } from 'vitest';
import { expectCaption as text } from '../../core/testing/captions';
import { callFrames, overMockCaption, resultCaption } from './frames';
import { BUGS, CLEAN, FLAKY_EVERY, KINDS, checkoutLines, overMockedTestLines, runConfig, runTest, verdict, type Config } from './model';

const all: Config[] = KINDS.flatMap((g) => KINDS.flatMap((t) => KINDS.flatMap((e) => KINDS.map((c) => ({ gateway: g, tax: t, email: e, clock: c })))));

describe('result captions', () => {
  it('say "caught" only when the run failed and passes without the bug, for every config × bug × run', () => {
    for (const cfg of all) {
      for (const bug of BUGS) {
        for (let run = 0; run < FLAKY_EVERY; run++) {
          const r = runConfig(cfg, bug, run);
          const v = bug === 'none' ? null : verdict(cfg, bug, run);
          const t = text(resultCaption(r, cfg, bug, run, v));
          expect(t.includes('Caught')).toBe(v === 'caught');
          if (t.includes('Caught')) expect(r.passed).toBe(false);
          expect(t.includes('shipped')).toBe(v === 'escaped');
          expect(t.startsWith(r.passed ? '✓ passed' : '✗ failed')).toBe(true);
          if (r.error) expect(t).toContain(r.error.slice(0, 20));
          expect(t).not.toContain('null');
          if (v === 'broken') expect(t).toMatch(/without (the bug|it)/);
        }
      }
    }
  });

  it('play one frame per recorded call, between a setup frame and the result', () => {
    const r = runConfig({ gateway: 'spy', tax: 'real', email: 'fake', clock: 'mock' }, 'twice', 0);
    const frames = callFrames(r, 'done');
    expect(frames.length).toBe(r.trace.length + 2);
    expect(frames.slice(1, -1).map((f) => f.call)).toEqual(r.trace.map((_, i) => i));
    expect(text(frames[2].say)).toContain('PaymentGateway.charge');
    expect(text(frames[2].say)).toContain('800 ms over the network');
  });
});

describe('over-mocking captions', () => {
  it.each(['mock', 'fake'] as const)('match what the run reported (gateway %s), for every tax double and refactor', (gw) => {
    for (const tax of ['mock', 'fake'] as const) {
      for (const refactor of [false, true]) {
        const r = runTest({ checkout: checkoutLines({ ...CLEAN, wrongField: true, useRate: refactor }), test: overMockedTestLines(gw, tax), roundingBug: false, run: 0 });
        const t = text(overMockCaption(r, gw, refactor));
        expect(t.startsWith(r.passed ? '✓ passed' : '✗ failed')).toBe(true);
        expect(t.includes('coupled to the implementation')).toBe(!r.passed && refactor && tax === 'mock');
        expect(t.includes('catches the integration bug')).toBe(!r.passed && gw === 'fake' && !(refactor && tax === 'mock'));
        expect(t.includes('rejects with a 400')).toBe(r.passed && gw === 'mock');
      }
    }
  });
});

describe('stub captions fit what the stub does', () => {
  it('an email stub returns nothing; a tax stub returns its canned answer', () => {
    const frames = callFrames(runConfig({ gateway: 'stub', tax: 'stub', email: 'stub', clock: 'stub' }, 'none', 0), 'done');
    const said = frames.map((f) => text(f.say));
    expect(said.find((s) => s.includes('EmailSender.send'))).toContain('does nothing and returns nothing');
    expect(said.find((s) => s.includes('TaxService.taxFor'))).toContain('returns its canned answer');
  });
});

import { describe, expect, it } from 'vitest';
import type { Bit } from '../../core/bits';
import { mulberry32 } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { captureCaption, dToggleCaption, srCaption } from './frames';
import {
  CLOCK_PERIOD, GLITCH_SCRIPT, MAX, MAX_PERIOD, MIN_PERIOD, SR_START, capture, clockAt, isRisingEdge, settleTicks, simulate, srSettle,
  sumSettleTicks, type SrState,
} from './model';

describe('SR latch', () => {
  it('sets, holds, resets and holds again', () => {
    let s: SrState = SR_START;
    const go = (sIn: Bit, rIn: Bit) => {
      const out = srSettle(s, sIn, rIn);
      s = out.state;
      return out;
    };
    expect(go(1, 0)).toEqual({ state: { q: 1, qBar: 0 }, status: 'set' });
    expect(go(0, 0)).toEqual({ state: { q: 1, qBar: 0 }, status: 'hold' });
    expect(go(0, 1)).toEqual({ state: { q: 0, qBar: 1 }, status: 'reset' });
    expect(go(0, 0)).toEqual({ state: { q: 0, qBar: 1 }, status: 'hold' });
  });

  it('S = R = 1 drives both outputs to 0; releasing both at once never settles', () => {
    for (const start of [{ q: 0, qBar: 1 }, { q: 1, qBar: 0 }] as SrState[]) {
      const invalid = srSettle(start, 1, 1);
      expect(invalid).toEqual({ state: { q: 0, qBar: 0 }, status: 'invalid' });
      expect(srSettle(invalid.state, 0, 0).status).toBe('unpredictable');
      // Releasing one at a time is fine: the one still held wins.
      expect(srSettle(invalid.state, 1, 0).status).toBe('set');
      expect(srSettle(invalid.state, 0, 1).status).toBe('reset');
    }
  });

  it('captions name the status', () => {
    expect(captionText(srCaption('invalid', { q: 0, qBar: 0 }))).toContain('invalid');
    expect(captionText(srCaption('unpredictable', { q: 0, qBar: 0 }))).toContain('unpredictable');
    expect(captionText(srCaption('hold', { q: 1, qBar: 0 }))).toContain('Q stays 1');
  });
});

describe('D latch vs D flip-flop', () => {
  it('the glitch preset: the latch passes the glitch, the flip-flop blocks it', () => {
    const out = simulate(GLITCH_SCRIPT);
    const highPhase = out.filter((s) => s.t >= CLOCK_PERIOD && s.t < CLOCK_PERIOD * 1.5);
    expect(highPhase.every((s) => s.clk === 1)).toBe(true);
    expect(highPhase.some((s) => s.d === 0)).toBe(true);
    expect(highPhase.map((s) => s.latch)).toEqual(highPhase.map((s) => s.d));
    expect(out.filter((s) => s.t >= CLOCK_PERIOD).every((s) => s.ff === 1)).toBe(true);
  });

  it('the latch follows D exactly while CLK is high and holds while it is low', () => {
    const rnd = mulberry32(9);
    const d = Array.from({ length: 400 }, () => (rnd() < 0.5 ? 0 : 1) as Bit);
    const out = simulate(d);
    out.forEach((s, i) => {
      if (s.clk) expect(s.latch).toBe(s.d);
      else if (i > 0) expect(s.latch).toBe(out[i - 1].latch);
    });
  });

  it('the flip-flop changes only at rising edges, over 1,000 seeded random D waveforms', () => {
    const rnd = mulberry32(42);
    for (let w = 0; w < 1000; w++) {
      const d = Array.from({ length: 64 }, () => (rnd() < 0.5 ? 0 : 1) as Bit);
      const out = simulate(d);
      for (let i = 1; i < out.length; i++) {
        if (out[i].ff !== out[i - 1].ff && !isRisingEdge(out[i].t)) throw new Error(`waveform ${w} changed at t=${i}`);
        if (isRisingEdge(out[i].t)) expect(out[i].ff).toBe(out[i].d);
      }
    }
  });

  it('the clock is high for the first half of each period', () => {
    expect(Array.from({ length: CLOCK_PERIOD }, (_, t) => clockAt(t))).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
    expect(isRisingEdge(CLOCK_PERIOD)).toBe(true);
    expect(isRisingEdge(0)).toBe(false);
  });

  it('the D-toggle caption depends only on the clock level', () => {
    expect(captionText(dToggleCaption(1, 0))).toContain('transparent');
    expect(captionText(dToggleCaption(0, 1))).toContain('both hold');
  });
});

describe('register and counter', () => {
  it('counts 0…15 then wraps to 0 when the clock is slow enough', () => {
    let q = 0;
    const seen: number[] = [];
    for (let edge = 0; edge < 17; edge++) {
      seen.push(q);
      q = capture(q, MAX_PERIOD).captured;
    }
    expect(seen).toEqual([...Array.from({ length: 16 }, (_, i) => i), 0]);
  });

  it('settle time follows the adders model for the four sum bits (the counter drops the carry out)', () => {
    expect(settleTicks(0b0111)).toBe(3);
    expect(settleTicks(0b1111)).toBe(3);
    expect(settleTicks(0b0110)).toBe(4);
    expect(settleTicks(0b0010)).toBe(3);
    expect(settleTicks(0b1000)).toBe(2);
    expect(sumSettleTicks(0b0011)).toEqual([1, 1, 2, 1]);
    for (let q = 0; q <= MAX; q++) expect(settleTicks(q)).toBeLessThanOrEqual(MAX_PERIOD);
  });

  it('a period shorter than the settle time captures a wrong value exactly when a stale bit should have changed', () => {
    for (let q = 0; q <= MAX; q++) {
      for (let p = MIN_PERIOD; p <= MAX_PERIOD; p++) {
        const { captured, correct, stale } = capture(q, p);
        expect(correct).toBe((q + 1) & MAX);
        if (p >= settleTicks(q)) expect(captured).toBe(correct);
        expect(captured !== correct).toBe(stale.length > 0);
        const text = captionText(captureCaption(q, p));
        expect(text.includes('Wrong value captured'), `q=${q} p=${p}`).toBe(captured !== correct);
        expect(text.includes('had settled')).toBe(p >= settleTicks(q));
      }
    }
  });
});

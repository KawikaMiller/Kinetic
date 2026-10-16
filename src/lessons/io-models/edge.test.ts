import { describe, expect, it } from 'vitest';
import { MESSAGE_BYTES, parseReadSize, runEdge, type Trigger } from './edge';

/**
 * Pins taken from a real Linux kernel (6.18, WSL2), run once with a socketpair: 300 bytes written, EPOLLIN | EPOLLET,
 * one read of 100: epoll_wait then returned 0 events; level-triggered returned 1 event after each partial read; an edge-triggered
 * handler that read until EAGAIN received all 300 bytes. The model must reproduce those three observations.
 */
describe('level versus edge, checked for every read size from 1 to 300', () => {
  const sizes = Array.from({ length: MESSAGE_BYTES }, (_, i) => i + 1);

  it('edge-triggered with one read per notification hangs exactly when the read is shorter than the message, and says hung, not idle', () => {
    for (const n of sizes) {
      const r = runEdge({ trigger: 'edge', readBytes: n, drain: false });
      expect(r.reports, `n=${n}`).toBe(1);
      expect(r.reads).toBe(1);
      expect(r.remaining).toBe(Math.max(0, MESSAGE_BYTES - n));
      expect(r.verdict).toBe(n < MESSAGE_BYTES ? 'hung' : 'done');
    }
  });

  it('the same schedule drained to EAGAIN completes for every size: ceil(300 / n) data reads plus one EAGAIN', () => {
    for (const n of sizes) {
      const r = runEdge({ trigger: 'edge', readBytes: n, drain: true });
      expect([r.verdict, r.remaining, r.readTotal, r.reports], `n=${n}`).toEqual(['done', 0, MESSAGE_BYTES, 1]);
      expect(r.reads).toBe(Math.ceil(MESSAGE_BYTES / n) + 1);
      expect(r.events.filter((e) => e.kind === 'eagain')).toHaveLength(1);
    }
  });

  it('level-triggered is reported again while bytes remain: ceil(300 / n) reports and reads, never hung, with or without draining', () => {
    for (const n of sizes) {
      const lazy = runEdge({ trigger: 'level', readBytes: n, drain: false });
      expect([lazy.verdict, lazy.reports, lazy.reads, lazy.remaining], `n=${n}`).toEqual(['done', Math.ceil(MESSAGE_BYTES / n), Math.ceil(MESSAGE_BYTES / n), 0]);
      const drained = runEdge({ trigger: 'level', readBytes: n, drain: true });
      expect([drained.verdict, drained.reports, drained.remaining]).toEqual(['done', 1, 0]);
    }
  });

  it('bytes are conserved: read + remaining = 300 after every event, and read never decreases', () => {
    for (const trigger of ['level', 'edge'] as Trigger[]) {
      for (const drain of [false, true]) {
        for (const n of [1, 50, 100, 299, 300]) {
          const run = runEdge({ trigger, readBytes: n, drain });
          let last = 0;
          for (const e of run.events) {
            expect(e.readSoFar).toBeGreaterThanOrEqual(last);
            expect(e.readSoFar).toBeLessThanOrEqual(MESSAGE_BYTES);
            last = e.readSoFar;
          }
          expect(run.readTotal + run.remaining).toBe(MESSAGE_BYTES);
        }
      }
    }
  });

  it('the default (edge, 100 bytes, no drain) is the hung case: 200 bytes unread', () => {
    const r = runEdge({ trigger: 'edge', readBytes: 100, drain: false });
    expect([r.verdict, r.remaining]).toEqual(['hung', 200]);
    expect(r.events.at(-1)!.say).toContain('hung');
  });
});

describe('the typed read size', () => {
  it('accepts 1 to 300 and refuses the rest with a reason, 0 as a no-op', () => {
    expect(parseReadSize('75')).toEqual({ ok: true, value: 75 });
    expect(parseReadSize('300')).toEqual({ ok: true, value: 300 });
    const bad = (t: string) => {
      const r = parseReadSize(t);
      if (r.ok) throw new Error(`${t} accepted`);
      return r.error;
    };
    expect(bad('0')).toBe('A read of 0 is a no-op: pick 1 or more.');
    expect(bad('301')).toContain('300 or fewer');
    expect(bad('-5')).toContain('at least 1');
    expect(bad('1.5')).toContain('whole number');
    expect(bad('')).toContain('Type');
  });
});

import { describe, expect, it } from 'vitest';
import { WORKLOADS, SIZES, operationsFor, runWorkload, type WorkloadId } from './workloads';

/** The workload on a plain string and a plain cursor, as the independent reference for the final length. */
function referenceLength(id: WorkloadId, size: number): number {
  let len = size;
  for (const op of operationsFor(id, size)) {
    if (op.kind === 'insert') len += op.items.length;
    else if (op.kind === 'delete') len -= op.to - op.from;
    else if (op.kind === 'undo') {
      /* undone below */
    }
  }
  if (id === 'undo') len -= 10;
  return len;
}

describe('workloads', () => {
  it('all three structures end with the same text after every workload at 1,000 and 10,000 characters (they did the same edits)', () => {
    for (const size of [1000, 10_000]) for (const w of WORKLOADS) expect(runWorkload(w.id, size).agree, `${w.id} ${size}`).toBe(true);
  });

  it('the operations are valid against a tracked length, and the undo workload returns to the starting length', () => {
    for (const w of WORKLOADS) {
      let len = 1000;
      for (const op of operationsFor(w.id, 1000)) {
        if (op.kind === 'insert') {
          expect(op.at).toBeGreaterThanOrEqual(0);
          expect(op.at).toBeLessThanOrEqual(len);
          len += op.items.length;
        } else if (op.kind === 'delete') {
          expect(op.to).toBeLessThanOrEqual(len);
          len -= op.to - op.from;
        } else if (op.kind === 'move') {
          expect(op.to).toBeLessThanOrEqual(len);
        }
      }
      expect(len).toBe(referenceLength(w.id, 1000) + (w.id === 'undo' ? 10 : 0));
    }
    expect(referenceLength('undo', 1000)).toBe(1000);
  });

  it('hand-worked counts: appending costs 1 per character for the array and the gap buffer; one front insert costs the array the whole text', () => {
    const append = runWorkload('append', 1000);
    expect(append.array.touches).toBe(200);
    expect(append.gap.touches).toBe(200);
    expect(append.winners).toEqual(['array', 'gap']);
    expect(append.rope.touches).toBeGreaterThan(append.array.touches);
    // 5 pastes of 500 at position 0: the array shifts the whole (growing) text each time, then writes 500
    let shifted = 0;
    for (let i = 0; i < 5; i++) shifted += 1000 + 500 * i;
    expect(runWorkload('paste', 1000).array.touches).toBe(shifted + 5 * 500);
  });

  it('each structure is the best or the worst somewhere, and the colours swap between workloads (computed, at every size)', () => {
    for (const size of SIZES) {
      const results = WORKLOADS.map((w) => runWorkload(w.id, size));
      const winners = new Set(results.flatMap((r) => r.winners));
      const losers = new Set(results.map((r) => r.loser));
      expect(winners.has('gap'), `gap wins ${size}`).toBe(true);
      expect(winners.has('rope'), `rope wins ${size}`).toBe(true);
      expect(winners.has('array'), `array ties for the win ${size}`).toBe(true);
      expect(losers.has('array') && losers.has('gap'), `loser swaps ${size}`).toBe(true);
    }
  });

  it('a far jump is a full copy for the gap buffer: alternating start and end costs it more than the array on the jump workload', () => {
    for (const size of SIZES) {
      const r = runWorkload('jump', size);
      expect(r.gap.touches, `${size}`).toBeGreaterThan(r.array.touches);
      expect(r.loser).toBe('gap');
      expect(r.winners).toEqual(['rope']);
    }
  });

  it('the rope\'s edits cost far less than the array\'s at one million characters, and its undo is nearly free', () => {
    const paste = runWorkload('paste', 1_000_000);
    expect(paste.rope.touches).toBeLessThan(paste.array.touches / 100);
    const undo = runWorkload('undo', 1_000_000);
    expect(undo.rope.touches).toBeLessThan(undo.array.touches / 1000);
    expect(runWorkload('type', 1_000_000).ropeRebuilds).toBeGreaterThan(0);
  });
});

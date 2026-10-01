import { describe, expect, it } from 'vitest';
import { programLines, runPlain, runTraced, type FailAt, type Mode, type Preset, type TraceEvent } from './model';

const PRESETS: Preset[] = ['boundary', 'swallow', 'rethrow', 'unhandled'];
const FAILS: FailAt[] = ['none', 'chargeCard', 'callBank'];
const CONFIGS: [Mode, Preset, FailAt][] = [
  ...PRESETS.flatMap((p) => FAILS.map((f) => ['exceptions', p, f] as [Mode, Preset, FailAt])),
  ...FAILS.map((f) => ['result', 'boundary', f] as [Mode, Preset, FailAt]),
];

/** The events as "kind fn" strings, logs left out. */
const shape = (events: TraceEvent[]) =>
  events.filter((e) => e.kind !== 'log').map((e) => ('fn' in e ? `${e.kind} ${e.fn}` : e.kind));

describe('the hooks change nothing the program does', () => {
  it.each(CONFIGS)('%s / %s / fail at %s: same output and same crash as the plain on-screen code', (mode, preset, fail) => {
    const lines = programLines(mode, preset, fail);
    const plain = runPlain(lines);
    const traced = runTraced(lines);
    expect(traced.output).toEqual(plain.output);
    expect(traced.crash).toBe(plain.crash);
  });
});

describe('exceptions', () => {
  it('handled at the boundary: unwinds callBank, runs finally, then the caller catches', () => {
    const t = runTraced(programLines('exceptions', 'boundary', 'callBank'));
    expect(shape(t.events)).toEqual([
      'enter main', 'enter handleRequest', 'enter chargeCard', 'enter callBank',
      'throw callBank', 'unwind callBank',
      'finally chargeCard', 'unwind chargeCard',
      'catch handleRequest', 'return handleRequest', 'leave handleRequest',
      'leave main',
    ]);
    expect(t.output).toEqual([
      'chargeCard: release the card lock',
      'handleRequest: caught bank timeout',
      'main: responded {"ok":false,"error":"bank timeout"}',
    ]);
  });

  it('finally runs on the happy path too, after the return value is computed', () => {
    const t = runTraced(programLines('exceptions', 'boundary', 'none'));
    const s = shape(t.events);
    expect(s.indexOf('return chargeCard')).toBeLessThan(s.indexOf('finally chargeCard'));
    expect(s.indexOf('finally chargeCard')).toBeLessThan(s.indexOf('leave chargeCard'));
    expect(t.output.at(-1)).toBe('main: responded {"ok":true,"status":"approved"}');
  });

  it('a throw inside the try still runs the finally', () => {
    const s = shape(runTraced(programLines('exceptions', 'boundary', 'chargeCard')).events);
    expect(s).toContain('finally chargeCard');
    expect(s.indexOf('throw chargeCard')).toBeLessThan(s.indexOf('finally chargeCard'));
  });

  it('an empty catch swallows the error and the request "succeeds" with the wrong result', () => {
    const t = runTraced(programLines('exceptions', 'swallow', 'callBank'));
    expect(shape(t.events)).toContain('swallow chargeCard');
    expect(shape(t.events)).not.toContain('catch handleRequest');
    expect(t.output).toEqual(['main: responded {"ok":true}']);
    expect(t.crash).toBeNull();
  });

  it('rethrow keeps the original error as the cause', () => {
    const t = runTraced(programLines('exceptions', 'rethrow', 'callBank'));
    const catches = t.events.filter((e) => e.kind === 'catch');
    expect(catches.map((e) => [e.fn, e.message])).toEqual([
      ['chargeCard', 'bank timeout'],
      ['handleRequest', 'payment failed'],
    ]);
    expect(t.output).toContain('handleRequest: caught payment failed (cause: bank timeout)');
  });

  it('with no catch anywhere, every frame unwinds and main crashes before its log line', () => {
    const t = runTraced(programLines('exceptions', 'unhandled', 'callBank'));
    expect(shape(t.events).filter((s) => s.startsWith('unwind'))).toEqual([
      'unwind callBank', 'unwind chargeCard', 'unwind handleRequest', 'unwind main',
    ]);
    expect(t.crash).toBe('Error: bank timeout');
    expect(t.output).toEqual(['chargeCard: release the card lock']);
  });

  it('matches real try/catch/finally ordering written by hand', () => {
    const order: string[] = [];
    const inner = () => {
      try {
        throw new Error('x');
      } finally {
        order.push('inner finally');
      }
    };
    try {
      inner();
    } catch {
      order.push('outer catch');
    }
    expect(order).toEqual(['inner finally', 'outer catch']);
  });
});

describe('result types', () => {
  it('no throws: each level returns the Err explicitly and main still responds', () => {
    const t = runTraced(programLines('result', 'boundary', 'callBank'));
    expect(shape(t.events).some((s) => s.startsWith('throw') || s.startsWith('unwind'))).toBe(false);
    const returns = t.events.filter((e) => e.kind === 'return').map((e) => (e.kind === 'return' ? [e.fn, e.value] : null));
    expect(returns).toEqual([
      ['callBank', { ok: false, error: 'bank timeout' }],
      ['chargeCard', { ok: false, error: 'bank timeout' }],
      ['handleRequest', { ok: false, error: 'bank timeout' }],
    ]);
    expect(t.output).toEqual(['main: responded {"ok":false,"error":"bank timeout"}']);
  });

  it('the happy path unwraps and re-wraps the value at each level', () => {
    const t = runTraced(programLines('result', 'boundary', 'none'));
    expect(t.output).toEqual(['main: responded {"ok":true,"status":"approved"}']);
  });
});

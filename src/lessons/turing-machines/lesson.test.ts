import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { parseTmTable, runTm, symbolAt, tapeText, TM_LIMITS, type Tm } from '../../core/tm';
import { sizeCaption, stepCaption } from './captions';
import lesson from './index';
import { allStrings, ALPHABET, checkInputs, checkTable, CHECK_EXTRA, CHECK_EXHAUSTIVE, decodeTable, doublingRatio, encodeTable, FRAME_CAP, frameStatus, growthWord, INCREMENT_NO_CARRY, INCREMENT_STARTER, INCREMENT_WRONG_WRITE, LINEAR_BELOW, MAX_INPUT, PALINDROME_STARTER, parseTapeInput, QUADRATIC_FROM, REFERENCE_MACHINES, runCase, STEP_BUDGET, stepsBySize, traceFrames } from './model';
import { INCREMENT_REFERENCE } from '../../core/tmTables';
import { mustParseTm } from '../../core/tm';

/** An independent simulator: the tape is an array that grows at either end, rules live in an object. */
function referenceRun(tm: Tm, input: string, maxSteps: number) {
  const rules: Record<string, { write: string; move: number; next: string }> = {};
  for (const r of tm.rules) rules[`${r.state}|${r.read}`] = { write: r.write, move: r.move === 'L' ? -1 : r.move === 'R' ? 1 : 0, next: r.next };
  const tape: string[] = input === '' ? ['_'] : [...input];
  let head = 0;
  let state = tm.start;
  let steps = 0;
  const halting = ['halt', 'accept', 'reject'];
  for (;;) {
    if (halting.includes(state)) return { status: 'halted' as const, state, steps, tape: trim(tape) };
    const rule = rules[`${state}|${tape[head]}`];
    if (!rule) return { status: 'stuck' as const, state, steps, tape: trim(tape) };
    if (steps >= maxSteps) return { status: 'budget-exhausted' as const, state, steps, tape: trim(tape) };
    tape[head] = rule.write;
    head += rule.move;
    state = rule.next;
    steps++;
    if (head < 0) {
      tape.unshift('_');
      head = 0;
    }
    if (head >= tape.length) tape.push('_');
  }
}
const trim = (tape: string[]) => tape.join('').replace(/^_+|_+$/g, '');

const INCREMENT = REFERENCE_MACHINES.increment;
const PALINDROME = REFERENCE_MACHINES.palindrome;
const BINARY = ['0', '1'];
const AB = ['a', 'b'];

describe('binary increment against BigInt', () => {
  it('leaves value + 1 on the tape for every binary string up to 10 bits, the empty tape included (2,047 inputs)', () => {
    const all = allStrings(BINARY, 10);
    expect(all).toHaveLength(2047);
    for (const s of all) {
      const run = runTm(INCREMENT, s, { maxSteps: STEP_BUDGET });
      expect(run.status, s).toBe('halted');
      expect(BigInt(`0b${tapeText(run.config)}`), s).toBe(BigInt(`0b${s || '0'}`) + 1n);
    }
  });

  it('is accepted by Check on its whole input list and on every one of the 2,047 strings', () => {
    expect(checkTable('increment', INCREMENT).first).toBeNull();
    expect(checkTable('increment', INCREMENT, allStrings(BINARY, 10)).failures).toHaveLength(0);
  });

  it('pins the step counts worked by hand: 1011 and 111 take 8, 0 takes 3, all ones of length n take 2n + 2', () => {
    expect(runTm(INCREMENT, '1011', { maxSteps: STEP_BUDGET }).steps).toBe(8);
    expect(runTm(INCREMENT, '111', { maxSteps: STEP_BUDGET }).steps).toBe(8);
    expect(runTm(INCREMENT, '0', { maxSteps: STEP_BUDGET }).steps).toBe(3);
    for (let n = 1; n <= MAX_INPUT; n++) expect(runTm(INCREMENT, '1'.repeat(n), { maxSteps: STEP_BUDGET }).steps, `n=${n}`).toBe(2 * n + 2);
  });
});

describe('the two named mutants', () => {
  it('deleting the carry rule leaves the input 1 stuck in q1 reading 1', () => {
    const report = checkTable('increment', mustParseTm(INCREMENT_NO_CARRY));
    expect(report.first?.input).toBe('1');
    expect(report.first?.verdict).toEqual({ kind: 'stuck', state: 'q1', read: '1' });
    expect(report.failures.length).toBeGreaterThan(1);
  });

  it('writing 0 instead of 1 leaves 0 unchanged: it halts with the wrong tape', () => {
    const report = checkTable('increment', mustParseTm(INCREMENT_WRONG_WRITE));
    expect(report.first?.input).toBe('0');
    expect(report.first?.run.status).toBe('halted');
    expect(report.first?.verdict).toEqual({ kind: 'wrong', got: '0', expected: '1' });
  });

  it('both mutants differ from the reference by exactly one rule', () => {
    const lines = (t: string) => t.split('\n').filter((l) => !l.startsWith('#'));
    expect(lines(INCREMENT_REFERENCE).length - lines(INCREMENT_NO_CARRY).length).toBe(1);
    const changed = lines(INCREMENT_REFERENCE).filter((l, i) => l !== lines(INCREMENT_WRONG_WRITE)[i]);
    expect(changed).toEqual(['q1 0 -> 1 S halt']);
  });
});

describe('palindrome check against string reversal', () => {
  it('accepts exactly the palindromes among all strings over {a, b} up to length 10', () => {
    const all = allStrings(AB, 10);
    expect(all).toHaveLength(2047);
    for (const s of all) {
      const run = runTm(PALINDROME, s, { maxSteps: STEP_BUDGET });
      const reversed = s.split('').reverse().join('');
      expect(run.status, s).toBe('halted');
      expect(run.config.state, s).toBe(s === reversed ? 'accept' : 'reject');
    }
  });

  it('pins aba at 10 steps, aabaa at 21, and the worst case of each length at (n + 1)(n + 2) / 2 for n up to 10', () => {
    expect(runTm(PALINDROME, 'aba', { maxSteps: STEP_BUDGET }).steps).toBe(10);
    expect(runTm(PALINDROME, 'aabaa', { maxSteps: STEP_BUDGET }).steps).toBe(21);
    for (let n = 0; n <= 10; n++) {
      const worst = Math.max(...allStrings(AB, n).filter((s) => s.length === n).map((s) => runTm(PALINDROME, s, { maxSteps: STEP_BUDGET }).steps));
      expect(worst, `n=${n}`).toBe(((n + 1) * (n + 2)) / 2);
    }
  });
});

describe('runTm against an independent array simulator', () => {
  const machines: [string, Tm][] = [
    ['increment', INCREMENT], ['no carry', mustParseTm(INCREMENT_NO_CARRY)], ['wrong write', mustParseTm(INCREMENT_WRONG_WRITE)],
    ['increment starter', mustParseTm(INCREMENT_STARTER)], ['palindrome', PALINDROME], ['palindrome starter', mustParseTm(PALINDROME_STARTER)],
  ];
  it.each(machines)('%s: same outcome, final state, tape and step count on every string up to 8 symbols', (_name, tm) => {
    for (const s of allStrings(tm === PALINDROME || _name.startsWith('palindrome') ? AB : BINARY, 8)) {
      const ours = runTm(tm, s, { maxSteps: STEP_BUDGET });
      const theirs = referenceRun(tm, s, STEP_BUDGET);
      expect(ours.status, s).toBe(theirs.status);
      expect(ours.steps, s).toBe(theirs.steps);
      expect(ours.config.state, s).toBe(theirs.state);
      expect(tapeText(ours.config).replace(/^_+|_+$/g, ''), s).toBe(theirs.tape);
    }
  });
});

describe('the Check input lists', () => {
  it('increment: every string of length 0 to 4 (31) plus 12 seeded longer ones, over {0, 1}', () => {
    const list = checkInputs('increment');
    expect(CHECK_EXHAUSTIVE.increment).toBe(4);
    expect(list).toHaveLength(31 + CHECK_EXTRA);
    expect(list.slice(0, 31)).toEqual(allStrings(BINARY, 4));
    for (const s of list.slice(31)) {
      expect(s.length).toBeGreaterThan(4);
      expect(s.length).toBeLessThanOrEqual(10);
      expect([...s].every((ch) => BINARY.includes(ch))).toBe(true);
    }
  });

  it('palindrome: every string of length 0 to 6 (127) plus 12 seeded longer ones, half of them palindromes', () => {
    const list = checkInputs('palindrome');
    expect(list.slice(0, 127)).toEqual(allStrings(AB, 6));
    const longer = list.slice(127);
    expect(longer).toHaveLength(CHECK_EXTRA);
    for (const s of longer) {
      expect(s.length).toBeGreaterThan(6);
      expect(s.length).toBeLessThanOrEqual(10);
      expect([...s].every((ch) => AB.includes(ch))).toBe(true);
    }
    expect(longer.filter((s) => s === [...s].reverse().join('')).length).toBeGreaterThanOrEqual(CHECK_EXTRA / 2);
  });

  it('are the same on every call (seeded)', () => {
    expect(checkInputs('palindrome')).toEqual(checkInputs('palindrome'));
  });

  it('flag a palindrome machine that always accepts, and one that always rejects, on a named first input', () => {
    const always = (verdict: string) => mustParseTm(`q0 a -> a R q0\nq0 b -> b R q0\nq0 _ -> _ S ${verdict}`);
    expect(checkTable('palindrome', always('accept')).first?.input).toBe('ab');
    expect(checkTable('palindrome', always('reject')).first?.input).toBe('');
    expect(checkTable('palindrome', always('halt')).first?.verdict).toEqual({ kind: 'wrong', got: 'halt', expected: 'accept' });
  });

  it('report a machine that runs past the budget as not halting within it, never as wrong', () => {
    const spin = mustParseTm('q0 _ -> 1 R q0\nq0 0 -> 0 R q0\nq0 1 -> 1 R q0');
    const report = checkTable('increment', spin);
    expect(report.first?.verdict).toEqual({ kind: 'budget' });
    expect(report.first?.run.steps).toBe(STEP_BUDGET);
  });
});

describe('hostile table and tape text', () => {
  const refusal = (text: string) => {
    const p = parseTmTable(text);
    return p.ok ? null : p.error;
  };
  it('names the line of each malformed rule the spec lists', () => {
    expect(refusal('q0 0 -> 0 R q0\nq0 1 -> 1 R')).toMatch(/Line 2/);
    expect(refusal('q0 0 0 R q0')).toMatch(/missing "->"/);
    expect(refusal('q0 0 -> 0 X q0')).toMatch(/unknown move "X"/);
    expect(refusal('q0 0 -> 0 R q0\nq0 0 -> 1 R q0')).toBe('Line 2: q0 0 already has a rule on line 1.');
    expect(refusal('q0 1 -> 1 R q0\nq0 1 -> 0 R q0')).toBe('Line 2: q0 1 already has a rule on line 1.');
    expect(refusal('verylongname 0 -> 0 R q0')).toMatch(/over 8 characters/);
  });

  it('refuses more than 40 rules and a line over 40 characters, and the limits are the spec’s', () => {
    expect(TM_LIMITS).toEqual({ maxRules: 40, maxLineChars: 40, maxNameChars: 8 });
    const many = Array.from({ length: 41 }, (_, i) => `s${i} 0 -> 0 R s${i}`).join('\n');
    expect(refusal(many)).toMatch(/more than 40 rules/);
    expect(refusal(`q0 0 -> 0 R q0 ${'#'.repeat(40)}`)).toMatch(/keep each rule to 40/);
  });

  it('refuses a tape that is too long or has a symbol outside the alphabet, with a message', () => {
    expect(parseTapeInput('1'.repeat(MAX_INPUT), ALPHABET.increment).ok).toBe(true);
    const long = parseTapeInput('1'.repeat(MAX_INPUT + 1), ALPHABET.increment);
    expect(long.ok).toBe(false);
    expect(parseTapeInput('10a1', ALPHABET.increment)).toEqual({ ok: false, error: '"a" is not in this task\'s alphabet (0, 1).' });
    expect(parseTapeInput('', ALPHABET.palindrome)).toEqual({ ok: true, value: '' });
  });
});

describe('stepping frames', () => {
  it('the increment run on 1011 is 9 frames: the start and 8 moves, ending halted', () => {
    const frames = traceFrames(INCREMENT, '1011');
    expect(frames).toHaveLength(9);
    expect(frames[0].end).toBe('running');
    expect(frames[8].end).toBe('halted');
    expect(frames[8].step).toBe(8);
    expect(tapeText(frames[8].config)).toBe('1100');
    expect(frames.slice(0, 8).every((f) => f.end === 'running')).toBe(true);
  });

  it('marks only the cells that a move changed', () => {
    const frames = traceFrames(INCREMENT, '1011');
    expect(frames[1].changed).toEqual([]);
    const lastWrite = frames[8];
    expect(lastWrite.changed).toEqual([1]);
    expect(symbolAt(lastWrite.config, 1)).toBe('1');
  });

  it('a stuck table ends in a stuck frame with no further frames', () => {
    const frames = traceFrames(mustParseTm(INCREMENT_STARTER), '1011');
    expect(frames[frames.length - 1].end).toBe('stuck');
    expect(frameStatus(frames[frames.length - 1], 'increment', '1011')).toBe('stuck');
  });

  it('a run past the frame cap jumps to the end and says budget when the budget runs out', () => {
    const spin = mustParseTm('q0 _ -> 1 R q0');
    const frames = traceFrames(spin, '');
    expect(frames).toHaveLength(FRAME_CAP + 2);
    const last = frames[frames.length - 1];
    expect(last.skipped).toBe(true);
    expect(last.end).toBe('budget');
    expect(last.step).toBe(STEP_BUDGET);
  });

  it('a halting run longer than the cap jumps to a halted frame with the true step count', () => {
    const chain: Tm = {
      start: 's0',
      rules: Array.from({ length: FRAME_CAP + 50 }, (_, i) => ({ state: `s${i}`, read: '_', write: '_', move: 'R' as const, next: i === FRAME_CAP + 49 ? 'halt' : `s${i + 1}` })),
    };
    const frames = traceFrames(chain, '');
    const last = frames[frames.length - 1];
    expect([frames.length, last.end, last.step, last.skipped]).toEqual([FRAME_CAP + 2, 'halted', FRAME_CAP + 50, true]);
  });
});

describe('captions say what the run did and never claim a loop', () => {
  const cases = [
    ['stuck', traceFrames(mustParseTm(INCREMENT_STARTER), '1011'), 'increment', '1011'],
    ['halted right', traceFrames(INCREMENT, '1011'), 'increment', '1011'],
    ['halted wrong', traceFrames(mustParseTm(INCREMENT_WRONG_WRITE), '0'), 'increment', '0'],
    ['palindrome accept', traceFrames(PALINDROME, 'aba'), 'palindrome', 'aba'],
    ['palindrome reject', traceFrames(PALINDROME, 'ab'), 'palindrome', 'ab'],
    ['budget', traceFrames(mustParseTm('q0 _ -> 1 R q0'), ''), 'increment', ''],
  ] as const;
  it.each(cases)('%s: every frame caption passes the glue check and never says "never halts" or "runs forever"', (_n, frames, task, input) => {
    for (const f of frames) {
      const text = expectCaption(stepCaption(f, task, input));
      expect(text).not.toMatch(/never halts|runs forever|loops forever|infinite loop/i);
    }
  });

  it('the stuck caption names the state and the symbol, and calls it a different failure from a wrong answer', () => {
    const frames = traceFrames(mustParseTm(INCREMENT_STARTER), '1011');
    const text = expectCaption(stepCaption(frames[frames.length - 1], 'increment', '1011'));
    expect(text).toContain('stuck in q1 reading 1');
    expect(text).toContain('different failure from a wrong answer');
  });

  it('the budget caption says "did not halt within 5,000 steps"', () => {
    const frames = traceFrames(mustParseTm('q0 _ -> 1 R q0'), '');
    expect(expectCaption(stepCaption(frames[frames.length - 1], 'increment', ''))).toContain('did not halt within 5,000 steps');
  });

  it('the correct-increment caption reads the number off the tape: 1011 + 1 = 1100', () => {
    const frames = traceFrames(INCREMENT, '1011');
    const text = expectCaption(stepCaption(frames[8], 'increment', '1011'));
    expect(text).toContain('11 + 1 = 12');
    expect(text).toContain('1100');
  });
});

describe('steps against size', () => {
  const inc = stepsBySize('increment', INCREMENT);
  const pal = stepsBySize('palindrome', PALINDROME);

  it('measures the increment at 2n + 2 and the palindrome machine at (n + 1)(n + 2) / 2 for n = 1 to 20', () => {
    expect(inc).toHaveLength(20);
    for (const p of inc) expect(p.steps, `inc ${p.n}`).toBe(2 * p.n + 2);
    for (const p of pal) expect(p.steps, `pal ${p.n}`).toBe(((p.n + 1) * (p.n + 2)) / 2);
  });

  it('the doubling ratios are 42 / 22 and 231 / 66', () => {
    expect(doublingRatio(inc, 10)).toBeCloseTo(42 / 22, 12);
    expect(doublingRatio(pal, 10)).toBeCloseTo(231 / 66, 12);
  });

  it('the growth words follow the thresholds at both edges', () => {
    expect(growthWord(LINEAR_BELOW - 0.01)).toBe('close to linear');
    expect(growthWord(LINEAR_BELOW)).toBe('between linear and quadratic');
    expect(growthWord(QUADRATIC_FROM - 0.01)).toBe('between linear and quadratic');
    expect(growthWord(QUADRATIC_FROM)).toBe('close to quadratic');
  });

  it('the caption quotes the ratio and the word computed from the same points', () => {
    expect(expectCaption(sizeCaption('increment', inc))).toContain('by 1.91, close to linear');
    expect(expectCaption(sizeCaption('palindrome', pal))).toContain('by 3.50, close to quadratic');
  });

  it('a table that is stuck leaves the plot empty and the caption says so without claiming a loop', () => {
    const stuck = stepsBySize('increment', mustParseTm(INCREMENT_STARTER));
    expect(stuck.every((p) => p.steps === null && p.status === 'stuck')).toBe(true);
    const text = expectCaption(sizeCaption('increment', stuck));
    expect(text).toContain('does not reach a halting state');
    expect(text).not.toMatch(/never|forever/i);
  });

  it('a table that outruns the budget on long inputs drops those points and counts them', () => {
    const slow = mustParseTm('q0 1 -> 1 L q0\nq0 _ -> 1 L q0');
    const points = stepsBySize('increment', slow);
    expect(points.every((p) => p.status === 'budget-exhausted')).toBe(true);
  });
});

describe('a table is data', () => {
  it('encodes to one line and decodes back to the same rules, for both reference tables', () => {
    for (const tm of [INCREMENT, PALINDROME]) {
      const line = encodeTable(tm);
      expect(line).not.toContain('\n');
      expect(decodeTable(line).rules).toEqual(tm.rules);
    }
    expect(encodeTable(INCREMENT).split(';')).toHaveLength(6);
  });
});

describe('try-this entries, from the default state', () => {
  it('try-this 1: the starter on 1011 ends stuck in q1 reading 1 after 5 steps', () => {
    const c = runCase('increment', mustParseTm(INCREMENT_STARTER), '1011');
    expect(c.run.steps).toBe(5);
    expect(c.verdict).toEqual({ kind: 'stuck', state: 'q1', read: '1' });
    expect(lesson.tryThis[0]).toContain('after 5 steps');
  });

  it('try-this 2: Check on the starter fails first on the empty tape, stuck in q1 after 1 step; the reference then gives 1100 in 8', () => {
    const first = checkTable('increment', mustParseTm(INCREMENT_STARTER)).first;
    expect(first?.input).toBe('');
    expect(first?.run.steps).toBe(1);
    expect(first?.verdict).toMatchObject({ kind: 'stuck', state: 'q1' });
    const run = runTm(INCREMENT, '1011', { maxSteps: STEP_BUDGET });
    expect([tapeText(run.config), run.steps]).toEqual(['1100', 8]);
    expect(lesson.tryThis[1]).toContain('1100 after 8 steps');
  });

  it('try-this 3: no carry rule: 1 stuck in q1 reading 1; wrong write: 0 halts with 0', () => {
    const noCarry = checkTable('increment', mustParseTm(INCREMENT_NO_CARRY)).first;
    expect([noCarry?.input, noCarry?.verdict]).toEqual(['1', { kind: 'stuck', state: 'q1', read: '1' }]);
    const wrong = checkTable('increment', mustParseTm(INCREMENT_WRONG_WRITE)).first;
    expect([wrong?.input, tapeText(wrong!.run.config)]).toEqual(['0', '0']);
  });

  it('try-this 4: the palindrome reference accepts aba after 10 steps', () => {
    const run = runTm(PALINDROME, 'aba', { maxSteps: STEP_BUDGET });
    expect([run.config.state, run.steps]).toEqual(['accept', 10]);
    expect(lesson.tryThis[3]).toContain('after 10 steps');
    expect(checkTable('palindrome', mustParseTm(PALINDROME_STARTER)).first).not.toBeNull();
  });

  it('try-this 5: 42 and 231 steps at length 20, ratios 1.91 and 3.50', () => {
    const text = lesson.tryThis[4];
    for (const part of ['42 steps', '231', 'length 20', '1.91', '3.50']) expect(text).toContain(part);
  });
});

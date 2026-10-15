import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import { parseTmTable, runTm, tapeText, tmStart, tmStep, TM_HALT_STATES, TM_LIMITS, type Tm, type TmMove, type TmOutcome } from './tm';

/** Every string over `alphabet` up to `maxLen` characters (including the empty string). */
function allStrings(alphabet: readonly string[], maxLen: number): string[] {
  const out = [''];
  let layer = [''];
  for (let n = 1; n <= maxLen; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => s + a));
    out.push(...layer);
  }
  return out;
}

const table = (text: string): Tm => {
  const p = parseTmTable(text);
  if (!p.ok) throw new Error(p.error);
  return p.value;
};
const BUDGET = { maxSteps: 5000 };

/** The reference tables of the turing-machines spec, as the learner would type them. */
const INCREMENT = table(`
q0 0 -> 0 R q0
q0 1 -> 1 R q0
q0 _ -> _ L q1
q1 1 -> 0 L q1
q1 0 -> 1 S halt
q1 _ -> 1 S halt
`);

const PALINDROME = table(`
q0 a -> _ R qA
q0 b -> _ R qB
q0 _ -> _ S accept
qA a -> a R qA
qA b -> b R qA
qA _ -> _ L cA
cA a -> _ L back
cA b -> b S reject
cA _ -> _ S accept
qB a -> a R qB
qB b -> b R qB
qB _ -> _ L cB
cB b -> _ L back
cB a -> a S reject
cB _ -> _ S accept
back a -> a L back
back b -> b L back
back _ -> _ R q0
`);

/** a^n b^n by crossing off one a (X) and one b (Y) per round. */
const ANBN = table(`
q0 a -> X R q1
q0 Y -> Y R q3
q0 _ -> _ S accept
q1 a -> a R q1
q1 Y -> Y R q1
q1 b -> Y L q2
q2 a -> a L q2
q2 Y -> Y L q2
q2 X -> X R q0
q3 Y -> Y R q3
q3 _ -> _ S accept
`);

describe('binary increment', () => {
  it('equals value + 1 on every binary string up to 10 bits', () => {
    for (const s of allStrings(['0', '1'], 10).filter(Boolean)) {
      const run = runTm(INCREMENT, s, BUDGET);
      expect(run.status, s).toBe('halted');
      expect(tapeText(run.config), s).toBe((BigInt('0b' + s) + 1n).toString(2).padStart(s.length, '0'));
    }
  });

  it('pins the step counts worked by hand: 1011 and 111 take 8 steps, 0 takes 3, all-ones of length n take 2n + 2', () => {
    expect(runTm(INCREMENT, '1011', BUDGET).steps).toBe(8);
    expect(tapeText(runTm(INCREMENT, '1011', BUDGET).config)).toBe('1100');
    expect(runTm(INCREMENT, '111', BUDGET).steps).toBe(8);
    expect(runTm(INCREMENT, '0', BUDGET).steps).toBe(3);
    for (let n = 1; n <= 12; n++) expect(runTm(INCREMENT, '1'.repeat(n), BUDGET).steps).toBe(2 * n + 2);
  });

  it('extends the tape to the left of the input when the carry runs off it', () => {
    const run = runTm(INCREMENT, '111', BUDGET);
    expect(tapeText(run.config)).toBe('1000');
    expect(Math.min(...run.config.tape.keys())).toBe(-1);
  });

  it('a table missing the carry rule ends stuck, and a wrong write halts with the wrong tape', () => {
    const noCarry = table(INCREMENT.rules.filter((r) => !(r.state === 'q1' && r.read === '1')).map((r) => `${r.state} ${r.read} -> ${r.write} ${r.move} ${r.next}`).join('\n'));
    const stuck = runTm(noCarry, '1', BUDGET);
    expect(stuck.status).toBe('stuck');
    expect(stuck.config.state).toBe('q1');
    const wrongWrite = table(INCREMENT.rules.map((r) => (r.state === 'q1' && r.read === '0' ? { ...r, write: '0' } : r)).map((r) => `${r.state} ${r.read} -> ${r.write} ${r.move} ${r.next}`).join('\n'));
    const run = runTm(wrongWrite, '0', BUDGET);
    expect(run.status).toBe('halted');
    expect(tapeText(run.config)).toBe('0');
  });
});

describe('palindromes over {a, b}', () => {
  const reversed = (s: string) => [...s].reverse().join('');

  it('accepts exactly the palindromes, every string up to length 10', () => {
    for (const s of allStrings(['a', 'b'], 10)) {
      const run = runTm(PALINDROME, s, BUDGET);
      expect(run.status, s).toBe('halted');
      expect(run.config.state, s).toBe(s === reversed(s) ? 'accept' : 'reject');
    }
  });

  it('pins aba at 10 steps and aabaa at 21 (worked by hand from the table)', () => {
    expect(runTm(PALINDROME, 'aba', BUDGET).steps).toBe(10);
    expect(runTm(PALINDROME, 'aabaa', BUDGET).steps).toBe(21);
  });

  it('takes quadratically many steps: the worst case over strings of length n grows as (n + 1)(n + 2) / 2', () => {
    for (let n = 1; n <= 10; n++) {
      const worst = Math.max(...allStrings(['a', 'b'], n).filter((s) => s.length === n).map((s) => runTm(PALINDROME, s, BUDGET).steps));
      expect(worst, `n = ${n}`).toBe(((n + 1) * (n + 2)) / 2);
    }
  });
});

describe('a^n b^n', () => {
  it('accepts exactly a^n b^n, every string of a and b up to length 10', () => {
    for (const s of allStrings(['a', 'b'], 10)) {
      const n = s.length / 2;
      const run = runTm(ANBN, s, BUDGET);
      const inLanguage = s === 'a'.repeat(n) + 'b'.repeat(n);
      // A rejected string either ends stuck (no rule) or is halted in no accepting state; here it can only get stuck.
      expect(run.status === 'halted' && run.config.state === 'accept', s).toBe(inLanguage);
    }
  });
});

describe('the step budget', () => {
  const RUNS_RIGHT = table('q0 _ -> _ R q0');
  const BOUNCES = table('q0 _ -> _ R q1\nq1 _ -> _ L q0');

  it('stops a machine that loops, as budget-exhausted, at exactly the budget', () => {
    for (const m of [RUNS_RIGHT, BOUNCES]) {
      const run = runTm(m, '', { maxSteps: 250 });
      expect(run.status).toBe('budget-exhausted');
      expect(run.steps).toBe(250);
    }
  });

  it('can only ever report halted, stuck or budget-exhausted: never a verdict about halting forever', () => {
    const seen = new Set<TmOutcome>();
    for (const [m, input] of [[INCREMENT, '1'], [RUNS_RIGHT, ''], [ANBN, 'b']] as const) seen.add(runTm(m, input, { maxSteps: 40 }).status);
    expect([...seen].sort()).toEqual(['budget-exhausted', 'halted', 'stuck']);
  });

  it('a machine that needs more steps than the budget is cut off, and gets further with a bigger one', () => {
    expect(runTm(INCREMENT, '1111', { maxSteps: 5 }).status).toBe('budget-exhausted');
    expect(runTm(INCREMENT, '1111', { maxSteps: 10 }).status).toBe('halted');
  });
});

describe('tmStep', () => {
  it('moves one rule at a time without touching the config it was given', () => {
    const start = tmStart(INCREMENT, '10');
    const before = JSON.stringify([...start.tape]);
    const s = tmStep(INCREMENT, start);
    expect(s.status).toBe('moved');
    if (s.status !== 'moved') return;
    expect(s.rule).toMatchObject({ state: 'q0', read: '1' });
    expect(s.config.head).toBe(1);
    expect(JSON.stringify([...start.tape])).toBe(before);
  });

  it('reports a halted machine and a stuck one without moving', () => {
    expect(tmStep(INCREMENT, { state: 'halt', head: 0, tape: new Map() }).status).toBe('halted');
    expect(tmStep(INCREMENT, { state: 'q1', head: 0, tape: new Map([[0, 'x']]) }).status).toBe('stuck');
  });
});

/** An independent minimal simulator: an array with an origin offset instead of a sparse map, rules in a lookup object. */
function reference(rules: { state: string; read: string; write: string; move: TmMove; next: string }[], input: string, maxSteps: number) {
  const lookup: Record<string, { write: string; move: TmMove; next: string }> = {};
  for (const r of rules) lookup[`${r.state}|${r.read}`] = r;
  const cells = input.split('');
  let head = 0;
  let state = 'q0';
  for (let steps = 0; ; steps++) {
    if (TM_HALT_STATES.includes(state)) return { status: 'halted' as const, state, steps, text: trim(cells) };
    if (head < 0) {
      cells.unshift('_');
      head = 0;
    }
    while (head >= cells.length) cells.push('_');
    const r = lookup[`${state}|${cells[head]}`];
    if (!r) return { status: 'stuck' as const, state, steps, text: trim(cells) };
    if (steps >= maxSteps) return { status: 'budget-exhausted' as const, state, steps, text: trim(cells) };
    cells[head] = r.write;
    head += r.move === 'L' ? -1 : r.move === 'R' ? 1 : 0;
    state = r.next;
  }
}
const trim = (cells: string[]) => cells.join('').replace(/^_+|_+$/g, '');

describe('runTm against the independent simulator', () => {
  it('agrees on halting class, final state, tape and step count over 500 seeded random 4-state tables', () => {
    const rnd = mulberry32(0x7a3);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    const states = ['q0', 'q1', 'q2', 'q3'];
    const targets = [...states, 'halt', 'accept'];
    const symbols = ['0', '1', '_'];
    const moves: TmMove[] = ['L', 'R', 'S'];
    const classes = new Set<TmOutcome>();
    for (let t = 0; t < 500; t++) {
      const rules = states.flatMap((state) =>
        symbols.filter(() => rnd() < 0.85).map((read) => ({ state, read, write: pick(symbols), move: pick(moves), next: pick(targets) })),
      );
      if (!rules.some((r) => r.state === 'q0')) continue;
      const tm: Tm = { start: 'q0', rules };
      for (const input of ['', '1', '0110', '10101']) {
        const mine = runTm(tm, input, { maxSteps: 60 });
        const theirs = reference(rules, input, 60);
        classes.add(mine.status);
        expect(mine.status).toBe(theirs.status);
        expect(mine.config.state).toBe(theirs.state);
        expect(mine.steps).toBe(theirs.steps);
        expect(tapeText(mine.config).replace(/^_+|_+$/g, '')).toBe(theirs.text);
      }
    }
    expect([...classes].sort()).toEqual(['budget-exhausted', 'halted', 'stuck']);
  });
});

describe('parseTmTable', () => {
  const refusal = (text: string) => {
    const p = parseTmTable(text);
    if (p.ok) throw new Error('expected a refusal');
    return p;
  };

  it('reads rules, skips blank lines and # comments, and takes the first rule as the start state', () => {
    const p = parseTmTable('# add one\n\nq5 1 -> 0 L q5\nq5 _ -> 1 S halt\n');
    expect(p).toEqual({
      ok: true,
      value: {
        start: 'q5',
        rules: [
          { state: 'q5', read: '1', write: '0', move: 'L', next: 'q5' },
          { state: 'q5', read: '_', write: '1', move: 'S', next: 'halt' },
        ],
      },
    });
  });

  it('refuses a missing arrow, naming the line', () => {
    expect(refusal('q0 0 -> 0 R q0\nq0 1 1 R q0')).toMatchObject({ line: 2, error: expect.stringContaining('missing "->"') });
  });

  it('refuses a wrong word count and an arrow in the wrong place', () => {
    expect(refusal('q0 0 -> 0 R').error).toContain('found 5 words');
    expect(refusal('q0 -> 0 0 R q0').error).toContain('found 6 words');
  });

  it('refuses an unknown move', () => {
    expect(refusal('q0 0 -> 0 X q0').error).toContain('unknown move "X"');
  });

  it('refuses a duplicate (state, symbol) rule and says where the first one is', () => {
    expect(refusal('q0 0 -> 0 R q0\nq0 1 -> 1 R q0\nq0 0 -> 1 L q0')).toMatchObject({ line: 3, error: 'Line 3: q0 0 already has a rule on line 1.' });
  });

  it('refuses a state name over 8 characters but accepts exactly 8', () => {
    expect(refusal('q0 0 -> 0 R verylongg').error).toContain('over 8 characters');
    expect(parseTmTable('abcdefgh 0 -> 0 R abcdefgh').ok).toBe(true);
  });

  it('refuses a multi-character symbol and a rule for a halting state', () => {
    expect(refusal('q0 01 -> 0 R q0').error).toContain('not one symbol');
    expect(refusal('halt 0 -> 0 R q0').error).toContain('halting state');
  });

  it('refuses more than 40 rules and a line over 40 characters, but allows exactly 40 and 40', () => {
    const rule = (i: number) => `q${i} 0 -> 0 R q0`;
    const forty = Array.from({ length: TM_LIMITS.maxRules }, (_, i) => rule(i)).join('\n');
    expect(parseTmTable(forty).ok).toBe(true);
    expect(refusal(`${forty}\n${rule(41)}`)).toMatchObject({ line: 41, error: expect.stringContaining('more than 40 rules') });
    const long = `q0 0 -> 0 R q0${' '.repeat(TM_LIMITS.maxLineChars - 14)}`;
    expect(long).toHaveLength(TM_LIMITS.maxLineChars);
    expect(parseTmTable(long).ok).toBe(true);
    expect(refusal(`${long} `).error).toContain('41 characters');
  });

  it('refuses an empty table, and never evaluates what it reads', () => {
    expect(refusal('  \n# nothing\n').error).toContain('empty');
    const g = globalThis as unknown as { pwned?: boolean };
    parseTmTable('q0 0 -> (g.pwned=true) R q0');
    expect(g.pwned).toBeUndefined();
  });

  it('accepts custom halting states', () => {
    const p = parseTmTable('q0 0 -> 0 R done', { halting: ['done'] });
    expect(p.ok && runTm(p.value, '0', BUDGET).status).toBe('halted');
  });
});

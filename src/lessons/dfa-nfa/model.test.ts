import { describe, expect, it } from 'vitest';
import { accepts, nfaRun, subsetConstruct } from '../../core/automata';
import { runFrames, subsetFrames, subsetPlan } from './frames';
import {
  CONTAINS_AB, DFA_PRESETS, DIV3, DOOR, ENDS_01, EVEN_UNION, NFA_PRESETS, TARGETS, allStrings, blankMachine, checkInput, checkMachine, edgesOf,
  isAccepting, nthFromEnd, reachable, runSteps, withSolution,
} from './model';

const regexOf: Record<string, RegExp> = {
  ab: /ab/,
  ends01: /01$/,
  nth3: /1..$/,
  union: /^(?:(?:1*01*0)*1*|(?:0*10*1)*0*)$/,
};

describe('DFA presets', () => {
  it('divisible by 3 agrees with parseInt(s, 2) % 3 on every binary string up to length 12', () => {
    for (const s of allStrings(['0', '1'], 12).slice(1)) expect(accepts(DIV3.machine, s)).toBe(parseInt(s, 2) % 3 === 0);
    // The empty string is the number 0, which is divisible by 3.
    expect(accepts(DIV3.machine, '')).toBe(true);
  });

  it('contains ab agrees with a regex on every string up to length 10', () => {
    for (const s of allStrings(['a', 'b'], 10)) expect(accepts(CONTAINS_AB.machine, s)).toBe(regexOf.ab.test(s));
  });

  it('the door accepts exactly the legal event sequences that end shut', () => {
    const legal = (s: string) => {
      let st = 'closed';
      for (const e of s) {
        const next: string | undefined = ({ closed: { o: 'open', l: 'locked' }, open: { c: 'closed' }, locked: { u: 'closed' } } as Record<string, Record<string, string>>)[st][e];
        if (!next) return false;
        st = next;
      }
      return st !== 'open';
    };
    for (const s of allStrings(DOOR.machine.alphabet, 6)) expect(accepts(DOOR.machine, s)).toBe(legal(s));
    expect(accepts(DOOR.machine, 'lo')).toBe(false);
  });
});

describe('NFA presets and the subset construction', () => {
  it.each(NFA_PRESETS.map((p) => [p.id, p] as const))('%s: NFA, subset DFA and a regex agree on every string up to length 10', (id, p) => {
    const { dfa } = subsetConstruct(p.machine);
    for (const s of allStrings(p.machine.alphabet, 10)) {
      const nfa = nfaRun(p.machine, s).accepted;
      expect(accepts(dfa, s)).toBe(nfa);
      expect(nfa).toBe(regexOf[id].test(s));
    }
  });

  it('3rd from the end needs exactly 8 reachable DFA states, and n from the end needs 2ⁿ', () => {
    expect(subsetConstruct(nthFromEnd(3).machine).dfa.states).toHaveLength(8);
    for (let n = 1; n <= 4; n++) {
      const p = nthFromEnd(n);
      const { dfa } = subsetConstruct(p.machine);
      expect(dfa.states).toHaveLength(2 ** n);
      expect(reachable(dfa).size).toBe(2 ** n);
      for (const s of allStrings(['0', '1'], 8)) expect(accepts(dfa, s)).toBe(s.length >= n && s[s.length - n] === '1');
    }
  });

  it('the subset frames fill one cell per row and end on the true count', () => {
    for (let n = 1; n <= 4; n++) {
      const plan = subsetPlan(nthFromEnd(n).machine);
      const frames = subsetFrames(plan, n);
      expect(frames).toHaveLength(plan.result.rows.length + 2);
      expect(frames[frames.length - 1].filled).toBe(plan.result.rows.length);
      expect(Object.keys(plan.bornAfter)).toHaveLength(2 ** n);
    }
  });
});

describe('runs', () => {
  it('the final frame verdict is the machine verdict, for every preset and every short input', () => {
    for (const p of [...DFA_PRESETS, ...NFA_PRESETS]) {
      for (const s of allStrings(p.machine.alphabet, 5)) {
        const frames = runFrames(p, [...s]);
        const last = frames[frames.length - 1];
        expect(last.verdict).toBe(accepts(p.machine, s));
      }
    }
  });

  it('a DFA run lights one state per step and the step taken is a real transition', () => {
    const steps = runSteps(DIV3.machine, [...'1101']);
    expect(steps.map((s) => s.states)).toEqual([['r0'], ['r1'], ['r0'], ['r0'], ['r1']]);
    for (const st of steps.slice(1)) for (const t of st.taken) expect(DIV3.machine.delta[t.from][t.symbol]).toBe(t.to);
  });

  it('ε-moves are followed before the first symbol', () => {
    const [first] = runSteps(EVEN_UNION.machine, []);
    expect(first.states).toEqual(['E0', 'F0', 'S']);
    expect(first.taken.map((t) => t.symbol)).toEqual(['ε', 'ε']);
    expect(isAccepting(EVEN_UNION.machine, first.states)).toBe(true);
  });

  it('a door that dies stops the run and rejects', () => {
    const frames = runFrames(DOOR, [...'lou']);
    expect(frames[frames.length - 1].verdict).toBe(false);
    expect(frames[frames.length - 1].states).toEqual([]);
  });
});

describe('input checking', () => {
  it('refuses symbols outside the alphabet with the alphabet named, and keeps nothing', () => {
    expect(checkInput(DIV3.machine, '102')).toEqual({ ok: false, error: '"2" is not in this machine\'s alphabet {0,1}.' });
    expect(checkInput(DIV3.machine, '1 0')).toEqual({ ok: false, error: "a space is not in this machine's alphabet {0,1}." });
    expect(checkInput(DIV3.machine, '1😀')).toEqual({ ok: false, error: '"😀" is not in this machine\'s alphabet {0,1}.' });
    expect(checkInput(DIV3.machine, '<b>')).toMatchObject({ ok: false });
    expect(checkInput(DIV3.machine, '1e400')).toMatchObject({ ok: false });
    expect(checkInput(DIV3.machine, '-1')).toMatchObject({ ok: false });
    expect(checkInput(DIV3.machine, '0,1,,1')).toMatchObject({ ok: false });
    expect(checkInput(DIV3.machine, '1'.repeat(23))).toEqual({ ok: false, error: 'Keep it to 20 symbols or fewer.' });
  });

  it('accepts the empty string and plain alphabet input', () => {
    expect(checkInput(DIV3.machine, '')).toEqual({ ok: true, symbols: [] });
    expect(checkInput(ENDS_01.machine, '0101')).toEqual({ ok: true, symbols: ['0', '1', '0', '1'] });
  });
});

describe('edit mode checker', () => {
  /** Independent brute force: every string, in order, without the early exit. */
  const bruteFirst = (m: ReturnType<typeof blankMachine>, test: (s: string) => boolean) => {
    const bad = allStrings(['0', '1'], 6).filter((s) => accepts(m, s) !== test(s));
    bad.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    return bad[0];
  };

  it('reports the shortest counterexample, matching a brute-force enumeration', () => {
    // A seeded sweep over many machines: every transition and accept set from a simple LCG.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 300; trial++) {
      const states = ['q0', 'q1', 'q2', 'q3'];
      const m = {
        ...blankMachine(),
        accept: states.filter(() => rnd() < 0.4),
        delta: Object.fromEntries(states.map((s) => [s, { '0': states[Math.floor(rnd() * 4)], '1': states[Math.floor(rnd() * 4)] }])),
      };
      for (const t of TARGETS) {
        const r = checkMachine(m, t);
        const brute = bruteFirst(m, t.test);
        if (brute === undefined) expect(r.ok).toBe(true);
        else expect(r).toMatchObject({ ok: false, counterexample: brute, shouldAccept: t.test(brute) });
      }
    }
  });

  it('every target has a solution that passes, and the blank machine fails on the empty string or soon after', () => {
    for (const t of TARGETS) {
      expect(checkMachine(withSolution(t), t)).toEqual({ ok: true, tested: 127 });
      // The solutions also hold well beyond the checked length.
      for (const s of allStrings(['0', '1'], 10)) expect(accepts(withSolution(t), s)).toBe(t.test(s));
    }
    expect(checkMachine(blankMachine(), TARGETS[0])).toMatchObject({ ok: false, counterexample: '' });
  });

  it('unreachable states are the ones the start never reaches', () => {
    expect([...reachable(blankMachine())]).toEqual(['q0']);
    expect(reachable(withSolution(TARGETS[2])).has('q3')).toBe(false);
  });
});

describe('drawing', () => {
  it('one arrow per state pair, labelled with every symbol that takes it', () => {
    const e = edgesOf(CONTAINS_AB.machine);
    expect(e.find((x) => x.from === 'q2' && x.to === 'q2')?.symbols).toEqual(['a', 'b']);
    expect(edgesOf(EVEN_UNION.machine).filter((x) => x.symbols.includes('ε'))).toHaveLength(2);
  });
});

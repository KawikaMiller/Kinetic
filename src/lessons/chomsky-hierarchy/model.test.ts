/**
 * Independent oracles: reference predicates (counting, halves, trial division), brute-force Myhill-Nerode
 * behaviour classes, enumeration of every split, and the textbook statements typed a second time.
 */
import { describe, expect, it } from 'vitest';
import { runTm, type Tm } from '../../core/tm';
import { EVIDENCE, evidenceFor, witness } from './evidence';
import { CARDS, KEY, RINGS, cardById, decide, ringIndex, type CardId, type RingId } from './languages';
import { cannotWin, cfCount, chooseString, decompositions, loopIn, playGame, pump, pumpLanguage, regularCount } from './pumping';
import { forbiddenCalls, NO_REGEXP_OR_FUNCTION } from '../../core/testing/forbidden';

function strings(alphabet: readonly string[], max: number): string[] {
  const out = [''];
  let layer = [''];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => s + a));
    for (const s of layer) out.push(s);
  }
  return out;
}

describe('the cards', () => {
  for (const card of CARDS.filter((c) => c.machine !== null)) {
    it(`${card.id}: the ${card.machine} equals the reference predicate on every string over ${[...new Set([...card.alphabet, 'c'])].join('')} up to length 10`, () => {
      const alphabet = [...new Set([...card.alphabet, 'c'])];
      for (const s of strings(alphabet, 10)) {
        const d = decide(card, s)!;
        expect(d.verdict, `${card.id} on "${s}"`).toBe(card.member!(s) ? 'accepted' : 'rejected');
      }
    });
  }

  it('the sample strings are one member and one non-member for every card with a machine', () => {
    for (const card of CARDS.filter((c) => c.machine !== null)) {
      expect(card.samples.map((s) => card.member!(s)), card.id).toEqual([true, false]);
    }
  });

  it('the halting card has no decider and no predicate: the lesson only labels it', () => {
    const halts = cardById('halts');
    expect([halts.machine, halts.member, decide(halts, '')]).toEqual([null, null, null]);
  });

  it('the ring key equals a second table typed from the textbook statements, and a flipped key fails', () => {
    const textbook: Record<CardId, RingId> = {
      an: 'regular', abstar: 'regular', evena: 'regular', anbn: 'cf', brackets: 'cf', wwr: 'cf', ww: 'cs', anbncn: 'cs', prime: 'cs', halts: 're',
    };
    expect(KEY).toEqual(textbook);
    expect({ ...KEY, anbn: 'regular' }).not.toEqual(textbook);
    expect(RINGS.map((r) => r.id)).toEqual(['regular', 'cf', 'cs', 'decidable', 're']);
  });

  it('a machine that does not stop is cut by the budget and reported as such', () => {
    const loop: Tm = { start: 'q0', rules: [{ state: 'q0', read: '_', write: '_', move: 'R', next: 'q0' }] };
    expect(runTm(loop, '', { maxSteps: 500 })).toMatchObject({ status: 'budget-exhausted', steps: 500 });
  });
});

describe('the pumping game', () => {
  const anbn = pumpLanguage('anbn');
  const abstar = pumpLanguage('abstar');
  const equal = pumpLanguage('equal');
  const anbncn = pumpLanguage('anbncn');

  it('a^n b^n with p = 4 and s = a^4 b^4 has 10 splits (1 + 2 + 3 + 4) and every one has a leaving i', () => {
    const g = playGame(anbn, 'aaaabbbb', 4, 'regular');
    expect(g.rows).toHaveLength(10);
    expect(g.won).toBe(true);
    expect(g.rows.every((r) => r.firstLeaving !== null)).toBe(true);
  });

  it('(ab)* with s = (ab)^3 and p = 4 has a surviving split, and it is the loop the minimal DFA gives', () => {
    const g = playGame(abstar, 'ababab', 4, 'regular');
    expect(g.won).toBe(false);
    for (const row of g.surviving) {
      const [x, y] = row.decomposition.pieces;
      expect(loopIn(abstar.dfa!, x, y).closes).toBe(true);
    }
    const loops = g.rows.filter((r) => loopIn(abstar.dfa!, r.decomposition.pieces[0], r.decomposition.pieces[1]).closes);
    expect(g.surviving.map((r) => r.decomposition.pieces.join('|'))).toEqual(loops.map((r) => r.decomposition.pieces.join('|')));
  });

  it('against a regular language the learner cannot win for any p from 2 to 6 and any string', () => {
    for (let p = 2; p <= 6; p++) {
      for (let n = Math.ceil(p / 2); n <= 8; n++) expect(playGame(abstar, 'ab'.repeat(n), p, 'regular').won, `p=${p} n=${n}`).toBe(false);
    }
  });

  it('the poor choice: (ab)^4 against equal numbers survives (y = ab), a^4 b^4 wins; both for every p', () => {
    const poor = playGame(equal, 'abababab', 4, 'regular');
    expect(poor.won).toBe(false);
    expect(poor.surviving.some((r) => r.decomposition.pieces[1] === 'ab')).toBe(true);
    expect(playGame(equal, 'aaaabbbb', 4, 'regular').won).toBe(true);
    for (let p = 2; p <= 6; p++) {
      expect(playGame(equal, 'ab'.repeat(p), p, 'regular').won, `poor p=${p}`).toBe(false);
      expect(playGame(equal, 'a'.repeat(p) + 'b'.repeat(p), p, 'regular').won, `good p=${p}`).toBe(true);
    }
  });

  it('context-free mode on a^p b^p c^p for p = 2 to 4: every decomposition leaves, and the count equals the enumeration and the closed form', () => {
    for (let p = 2; p <= 4; p++) {
      const s = 'a'.repeat(p) + 'b'.repeat(p) + 'c'.repeat(p);
      const g = playGame(anbncn, s, p, 'cf');
      expect(g.won, `p=${p}`).toBe(true);
      expect(g.rows.length).toBe(cfCount(s.length, p));
      expect(decompositions(s, p, 'cf')).toHaveLength(cfCount(s.length, p));
    }
  });

  it('the counts equal a direct enumeration of every choice of cut points', () => {
    for (const [s, p] of [['aaaabbbb', 4], ['abab', 2], ['aaabbbccc', 3]] as const) {
      let regular = 0;
      for (let i = 0; i <= s.length; i++) for (let j = i + 1; j <= s.length; j++) if (j <= p) regular++;
      expect(decompositions(s, p, 'regular')).toHaveLength(regular);
      expect(regularCount(s.length, p)).toBe(regular);
      let cf = 0;
      for (let a = 0; a <= s.length; a++) {
        for (let b = a; b <= s.length; b++) {
          for (let c = b; c <= s.length; c++) {
            for (let d = c; d <= s.length; d++) if (d - a <= p && (b - a) + (d - c) >= 1) cf++;
          }
        }
      }
      expect(decompositions(s, p, 'cf')).toHaveLength(cf);
    }
  });

  it('pumping with i = 1 gives the string back, and i = 0 drops the pumped parts', () => {
    const d = decompositions('aabb', 2, 'cf')[3];
    expect(pump(d, 1)).toBe('aabb');
    expect(pump(d, 0).length).toBe(4 - d.pieces[1].length - d.pieces[3].length);
  });

  it('a^p b^p c^p is beaten in both modes at p = 2', () => {
    const s = 'aabbcc';
    expect(playGame(anbncn, s, 2, 'regular').won).toBe(true);
    expect(playGame(anbncn, s, 2, 'cf').won).toBe(true);
  });

  it('the context-free lemma holds for the context-free languages: no string wins the context-free game for p = 2 to 4', () => {
    for (const lang of [anbn, abstar, equal]) {
      expect(cannotWin(lang, 'cf')).toBe(true);
      for (let p = 2; p <= 4; p++) {
        for (const shape of lang.shapes) {
          for (let n = 0; n <= 12; n++) {
            const setup = chooseString(lang, shape.id, n, p);
            if (setup.ok) expect(playGame(lang, setup.s, p, 'cf').won, `${lang.id} ${shape.id} n=${n} p=${p}`).toBe(false);
          }
        }
      }
    }
    expect(cannotWin(anbncn, 'cf')).toBe(false);
    expect(cannotWin(anbn, 'regular')).toBe(false);
  });

  it('hostile choices are refused with the reason', () => {
    expect(chooseString(anbn, 'anbn', 1, 4)).toEqual({ ok: false, error: 'ab has length 2, shorter than p = 4. Choose a larger n.' });
    expect(chooseString(anbn, 'abn', 3, 2)).toEqual({ ok: false, error: 'ababab is not in the language aⁿbⁿ, so it is not a legal choice.' });
    expect(chooseString(anbn, 'anbn', 13, 2)).toEqual({ ok: false, error: 'n is a whole number from 0 to 12.' });
    expect(chooseString(anbn, 'anbn', 4, 4)).toEqual({ ok: true, s: 'aaaabbbb' });
  });
});

describe('the wrong-placement evidence', () => {
  it('the pumping experiments the evidence shows are real wins for the witness strings', () => {
    for (const id of ['anbn', 'brackets', 'wwr', 'ww', 'anbncn', 'prime'] as const) {
      const card = cardById(id);
      const s = witness(card, EVIDENCE.regularP)!;
      expect(card.member!(s), id).toBe(true);
      expect(playGame({ member: card.member! }, s, EVIDENCE.regularP, 'regular').won, `${id} regular`).toBe(true);
    }
    for (const id of ['ww', 'anbncn', 'prime'] as const) {
      const card = cardById(id);
      const s = witness(card, EVIDENCE.cfP)!;
      expect(card.member!(s), id).toBe(true);
      expect(playGame({ member: card.member! }, s, EVIDENCE.cfP, 'cf').won, `${id} cf`).toBe(true);
    }
  });

  it('every card in every ring gives a clean answer, and its relation follows the ring order', () => {
    for (const card of CARDS) {
      for (const ring of RINGS) {
        const e = evidenceFor(card, ring.id);
        const expected = ring.id === card.ring ? 'right' : ringIndex(ring.id) > ringIndex(card.ring) ? 'too-large' : 'too-small';
        expect(e.relation, `${card.id} in ${ring.id}`).toBe(expected);
        for (const line of e.lines) expect(line).not.toMatch(/NaN|undefined|\[object|null/);
        if (expected === 'too-small') expect(e.lines.length, `${card.id} in ${ring.id}`).toBeGreaterThan(0);
      }
      expect(evidenceFor(card, null)).toEqual({ relation: 'unsorted', lines: [] });
    }
  });

  it('the a^n b^n counter and the a^n b^n c^n PDA numbers are the ones the model gives', () => {
    expect(evidenceFor(cardById('anbn'), 'regular').lines[0]).toContain('has 8 states');
    expect(evidenceFor(cardById('anbn'), 'regular').lines[0]).toContain('n = 4');
    expect(evidenceFor(cardById('anbncn'), 'cf').lines[0]).toContain('accepts a^3 b^3 c^3 and accepts a^3 b^3 c^4 too');
  });
});

describe('no learner text reaches RegExp, eval or Function', () => {
  const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
  it('the lesson sources contain no new RegExp, RegExp( call, eval( or new Function', () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));
    expect(files.map(([name]) => name)).toContain('./pumping.ts');
    expect(forbiddenCalls(Object.fromEntries(files), { also: NO_REGEXP_OR_FUNCTION, ignoreComments: true })).toEqual([]);
  });
});

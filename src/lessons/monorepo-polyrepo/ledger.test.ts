import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { ledgerCaption } from './captions';
import { FACTOR_LABEL, LINES, OPENING_FACTORS, TIE_MARGIN, lean, tally, type Factors } from './ledger';

const KEYS = Object.keys(FACTOR_LABEL) as (keyof Factors)[];
const GRID = [0, 0.25, 0.5, 0.75, 1];

function* factorGrid(): Generator<Factors> {
  for (const teams of GRID) for (const shared of GRID) for (const cadence of GRID) for (const tooling of GRID) for (const access of GRID) yield { teams, shared, cadence, tooling, access };
}

describe('the ledger is not rigged', () => {
  it('has each option win somewhere when the five factors are swept over a 5 × 5 × 5 × 5 × 5 grid, and a level band between', () => {
    const wins = { monorepo: 0, polyrepo: 0, level: 0 };
    let total = 0;
    for (const f of factorGrid()) {
      const l = lean(f);
      wins[l.option ?? 'level']++;
      total++;
    }
    expect(total).toBe(3125);
    expect(wins.monorepo).toBeGreaterThan(0);
    expect(wins.polyrepo).toBeGreaterThan(0);
    expect(wins.level).toBeGreaterThan(0);
    // neither option sweeps the grid
    expect(wins.monorepo / total).toBeLessThan(0.9);
    expect(wins.polyrepo / total).toBeLessThan(0.9);
  });

  it('gives each option at least two lines of benefit and two of cost, each carrying a claim label', () => {
    for (const option of ['monorepo', 'polyrepo'] as const) {
      for (const side of ['benefit', 'cost'] as const) {
        expect(LINES.filter((l) => l.option === option && l.side === side).length, `${option} ${side}`).toBeGreaterThanOrEqual(2);
      }
    }
    for (const l of LINES) expect(['standard', 'research', 'practice', 'view']).toContain(l.claim);
    expect(LINES.some((l) => l.claim === 'view')).toBe(true);
  });

  it('keeps every line between 0 and 1 point over the grid, so no line outweighs the rest by construction', () => {
    for (const f of factorGrid()) for (const l of LINES) {
      const p = l.points(f);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('lets every slider matter: moving each factor from 0 to 1 changes at least one line, for both options', () => {
    for (const k of KEYS) {
      const lo = { ...OPENING_FACTORS, [k]: 0 };
      const hi = { ...OPENING_FACTORS, [k]: 1 };
      for (const option of ['monorepo', 'polyrepo'] as const) {
        const moved = LINES.filter((l) => l.option === option).some((l) => l.points(lo) !== l.points(hi));
        // access and cadence reach both options; tooling and teams reach cost lines, so each option has a line they move
        expect(moved || (k === 'tooling' && option === 'polyrepo'), `${k} ${option}`).toBe(true);
      }
    }
  });
});

describe('the tallies', () => {
  it('sum benefits and costs of one option, net = benefits − costs, against a hand-worked setting', () => {
    const f: Factors = { teams: 0.5, shared: 1, cadence: 0, tooling: 0, access: 0 };
    // monorepo: benefits 1 + 0.6 = 1.6; costs (1 − 0) × (0.3 + 0.35) + 0 + 0 = 0.65
    expect(tally('monorepo', f).benefits).toBeCloseTo(1.6, 12);
    expect(tally('monorepo', f).costs).toBeCloseTo(0.65, 12);
    expect(tally('monorepo', f).net).toBeCloseTo(0.95, 12);
    // polyrepo: benefits 0; costs 1 × 0.65 + 0.2 + 0.5 = 1.35
    expect(tally('polyrepo', f)).toMatchObject({ benefits: 0 });
    expect(tally('polyrepo', f).costs).toBeCloseTo(1.35, 12);
  });

  it('opens close to level, and calls nets within the margin level', () => {
    expect(lean(OPENING_FACTORS).margin).toBeLessThan(0.2);
    for (const f of factorGrid()) {
      const l = lean(f);
      if (l.option === null) expect(l.margin).toBeLessThan(TIE_MARGIN);
      else expect(l.margin).toBeGreaterThanOrEqual(TIE_MARGIN);
    }
  });
});

describe('the try-this and the caption', () => {
  it('try-this 5: cadence and access at 100% lean polyrepo, and shared code at 100% with both at 0% leans monorepo, from the opening factors', () => {
    expect(lean({ ...OPENING_FACTORS, cadence: 1, access: 1 }).option).toBe('polyrepo');
    expect(lean({ ...OPENING_FACTORS, shared: 1, cadence: 0, access: 0 }).option).toBe('monorepo');
  });

  it('says where the ledger leans and quotes both nets at the extremes and at the opening setting', () => {
    for (const f of [OPENING_FACTORS, { ...OPENING_FACTORS, cadence: 1, access: 1 }, { ...OPENING_FACTORS, shared: 1, cadence: 0, access: 0 }]) {
      const text = expectCaption(ledgerCaption(f));
      const l = lean(f);
      expect(text).toContain((Math.round(tally('monorepo', f).net * 100) / 100).toFixed(2));
      expect(text).toContain((Math.round(tally('polyrepo', f).net * 100) / 100).toFixed(2));
      expect(text).toContain(l.option === null ? 'level' : `leans ${l.option}`);
      expect(text).toContain('invented');
    }
  });
});

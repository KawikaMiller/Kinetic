import { describe, expect, it } from 'vitest';
import { choose, enumeratePaths, redMeters, startWalk, validateScenario, type Scenario } from '../../core/scenario';
import {
  CATEGORIES, CELLS, CONTROLS, ELEMENTS, FLOWS, TARGETS, ZONES, accepts, applyControl, categoriesOf, cellId, crossingFlows, flowStatus, metersOf, reveal, revealAll, startState,
  threatSentence, withPlacement, zoneOf, type Category, type ControlId, type Placement, type ThreatState, type ZoneId,
} from './model';
import { METER, MAX_EFFORT, NEW_THREAT, SPRINT, SPRINT_DAYS, SPRINT_THREATS, START_RISK, slipOf } from './sprint';

/** The per-element chart typed a second time, as strings, the way the book prints it (S T R I D E per row). */
const BOOK: Record<string, string> = {
  browser: 'SR',
  payment: 'SR',
  webapp: 'STRIDE',
  orders: 'TID',
  audit: 'TRID',
  'f-browser-web': 'TID',
  'f-web-orders': 'TID',
  'f-web-payment': 'TID',
  'f-web-audit': 'TID',
};

const ZONE_IDS = ZONES.map((z) => z.id);
const placements: Placement[] = ZONE_IDS.flatMap((orders) => ZONE_IDS.map((audit) => ({ orders, audit })));

describe('the STRIDE per-element chart', () => {
  it('equals the chart typed a second time, element by element', () => {
    for (const t of TARGETS) expect(categoriesOf(t).join(''), t.id).toBe(BOOK[t.id]);
  });

  it('a flipped cell in the second table fails the comparison', () => {
    const flipped: Record<string, string> = { ...BOOK, orders: 'TI' };
    expect(TARGETS.map((t) => categoriesOf(t).join('')).join()).not.toBe(TARGETS.map((t) => flipped[t.id]).join());
  });

  it('adds Repudiation to a store only when it is a log', () => {
    const store = { id: 's', label: 's', kind: 'store' as const };
    expect(categoriesOf(store).join('')).toBe('TID');
    expect(categoriesOf({ ...store, log: true }).join('')).toBe('TRID');
  });

  it('has 29 applicable cells, the sum of the per-element counts, whatever the zone arrangement', () => {
    const recount = Object.values(BOOK).reduce((n, s) => n + s.length, 0);
    expect(recount).toBe(29);
    expect(CELLS).toHaveLength(recount);
    for (const p of placements) expect(metersOf({ ...startState(), placement: p }).cells).toBe(recount);
  });

  it('gives every applicable cell a threat sentence and no other cell one', () => {
    for (const c of CELLS) expect(threatSentence(c.id).length, c.id).toBeGreaterThan(20);
    expect(new Set(CELLS.map((c) => c.id)).size).toBe(CELLS.length);
  });
});

describe('boundary crossings', () => {
  const FIXED: Record<string, ZoneId> = { browser: 'internet', webapp: 'app', payment: 'third' };
  const zone = (p: Placement, id: string) => FIXED[id] ?? p[id as 'orders' | 'audit'];
  const ENDS: [string, string][] = [['browser', 'webapp'], ['webapp', 'orders'], ['webapp', 'payment'], ['webapp', 'audit']];

  it('equals a recount from the zone of each endpoint, for all 4 x 4 placements of the two stores', () => {
    expect(placements).toHaveLength(16);
    for (const p of placements) {
      const expected = ENDS.filter(([a, b]) => zone(p, a) !== zone(p, b)).length;
      expect(crossingFlows(p), JSON.stringify(p)).toHaveLength(expected);
    }
  });

  it('a flow between two elements in one zone stays inside, and is not counted as reviewed', () => {
    const p: Placement = { orders: 'app', audit: 'app' };
    const s = withPlacement(startState(), p);
    expect(crossingFlows(p).map((f) => f.id)).toEqual(['f-browser-web', 'f-web-payment']);
    expect(flowStatus(s, FLOWS[1])).toBe('inside');
  });

  it('the three fixed elements stay in their zones', () => {
    for (const p of placements) expect(['browser', 'webapp', 'payment'].map((id) => zoneOf(p, id as 'browser'))).toEqual(['internet', 'app', 'third']);
  });
});

describe('controls against categories', () => {
  /** Typed a second time: which categories each control addresses. */
  const LISTED: Record<ControlId, string> = {
    authn: 'S', session: 'S', integrity: 'T', validation: 'T', 'audit-trail': 'RT', tls: 'IT', 'at-rest': 'I', 'rate-limit': 'D', authz: 'EI',
  };

  it('has nine controls and accepts each for exactly its listed categories (9 x 6)', () => {
    expect(CONTROLS).toHaveLength(9);
    for (const c of CONTROLS) {
      for (const cat of CATEGORIES) expect(accepts(c.id, cat.id), `${c.id} ${cat.id}`).toBe(LISTED[c.id].includes(cat.id));
    }
  });

  it('every category has at least one control, so no applicable cell is unanswerable', () => {
    for (const cat of CATEGORIES) expect(CONTROLS.some((c) => accepts(c.id, cat.id)), cat.id).toBe(true);
  });

  it('accepts a matching control on a revealed threat and marks it mitigated', () => {
    const id = cellId('browser', 'S');
    const s = reveal(startState(), id);
    const r = applyControl(s, id, 'authn');
    expect(r.kind).toBe('accepted');
    expect(r.state.mitigated[id]).toBe('authn');
    expect(metersOf(r.state).mitigated).toBe(1);
  });

  it('refuses a control for a category it does not address, with the reason, and changes nothing', () => {
    const id = cellId('browser', 'S');
    const s = reveal(startState(), id);
    const r = applyControl(s, id, 'rate-limit');
    expect(r.kind).toBe('refused');
    expect(r.state).toBe(s);
    expect(r.message).toContain('denial of service');
    expect(r.message).toContain('spoofing');
  });

  it('refuses a second control on an already-mitigated threat as already covered', () => {
    const id = cellId('orders', 'T');
    const once = applyControl(reveal(startState(), id), id, 'integrity');
    const twice = applyControl(once.state, id, 'validation');
    expect(twice.kind).toBe('refused');
    expect(twice.message).toContain('Already covered');
    expect(twice.state.mitigated[id]).toBe('integrity');
  });

  it('refuses a threat that has not been looked at, and a cell that does not exist', () => {
    expect(applyControl(startState(), cellId('orders', 'T'), 'integrity').kind).toBe('refused');
    expect(applyControl(revealAll(startState()), 'orders:S', 'authn').kind).toBe('refused');
  });

  it('every control is accepted somewhere in the full grid and refused somewhere else', () => {
    const all = revealAll(startState());
    for (const c of CONTROLS) {
      const results = CELLS.map((cell) => applyControl(all, cell.id, c.id).kind);
      expect(results, c.id).toContain('accepted');
      expect(results, c.id).toContain('refused');
    }
  });
});

describe('meters and flow status', () => {
  it('counts revealed, never-looked-at and unreviewed crossings from the state', () => {
    const s0 = startState();
    expect(metersOf(s0)).toMatchObject({ revealed: 0, neverLooked: 29, mitigated: 0, crossings: 3, unreviewedCrossings: 3 });
    const s1 = reveal(s0, cellId('f-browser-web', 'T'));
    expect(metersOf(s1)).toMatchObject({ revealed: 1, neverLooked: 28, unreviewedCrossings: 2 });
  });

  it('revealing a cell that does not apply, or twice, changes nothing', () => {
    const s = reveal(startState(), cellId('orders', 'T'));
    expect(reveal(s, cellId('orders', 'T'))).toBe(s);
    expect(reveal(s, 'orders:S')).toBe(s);
  });

  it('a crossing flow is covered only when all three of its threats are mitigated', () => {
    let s: ThreatState = revealAll(startState());
    const f = FLOWS[0];
    expect(flowStatus(s, f)).toBe('open');
    const controls: Record<Category, ControlId> = { S: 'authn', T: 'integrity', R: 'audit-trail', I: 'tls', D: 'rate-limit', E: 'authz' };
    for (const cat of categoriesOf(f)) {
      expect(flowStatus(s, f)).not.toBe('covered');
      s = applyControl(s, cellId(f.id, cat), controls[cat]).state;
    }
    expect(flowStatus(s, f)).toBe('covered');
  });

  it('element and flow counts match the spec: five elements, four flows', () => {
    expect([ELEMENTS.length, FLOWS.length, TARGETS.length]).toEqual([5, 4, 9]);
  });
});

describe('the sprint story', () => {
  /** The threat table typed a second time: likelihood, impact, fix days, partial-fix days. */
  const TABLE = [[4, 5, 3, 1], [3, 3, 2, 1], [2, 4, 2, 1]];

  it('passes the shared validator and every ending is reachable', () => {
    expect(validateScenario(SPRINT)).toEqual([]);
  });

  it('the validator rejects a copy with a dead end', () => {
    const broken: Scenario = { ...SPRINT, nodes: SPRINT.nodes.map((n, i) => (i === 1 ? { ...n, choices: [] } : n)) };
    expect(validateScenario(broken).map((p) => p.kind)).toContain('dead-end');
  });

  it('starts at the sum of likelihood x impact over the three threats, 37', () => {
    expect(TABLE.reduce((n, [l, i]) => n + l * i, 0)).toBe(37);
    expect(START_RISK).toBe(37);
    expect(SPRINT_THREATS).toHaveLength(3);
    expect(NEW_THREAT.likelihood * NEW_THREAT.impact).toBe(6);
    expect(MAX_EFFORT).toBe(8);
  });

  it('has 4 x 4 x 4 x 3 = 192 paths and every meter on every path equals an independent recount from the table', () => {
    const paths = enumeratePaths(SPRINT);
    expect(paths).toHaveLength(192);
    for (const p of paths) {
      let risk = 37;
      let effort = 0;
      let ownerless = 3;
      let crossings = 0;
      p.choices.slice(0, 3).forEach((id, k) => {
        const [l, i, fix, partial] = TABLE[k];
        const kind = id.split('-')[1];
        if (kind === 'fix') { risk -= l * i; effort += fix; ownerless -= 1; }
        if (kind === 'partial') { risk -= i; effort += partial; ownerless -= 1; }
        if (kind === 'accept') ownerless -= 1;
      });
      const late = p.choices[3];
      if (late === 'partner-rerun') { risk += 6; effort += 1; } else crossings = 1;
      expect(p.meters).toEqual({ [METER.risk]: risk, [METER.effort]: effort, [METER.ownerless]: ownerless, [METER.crossings]: crossings });
    }
  });

  it('every path reaches one of three endings, and all three occur', () => {
    expect(new Set(enumeratePaths(SPRINT).map((p) => p.endingId))).toEqual(new Set(['rerun', 'deferred', 'skipped']));
  });

  it('doing nothing is cheaper in days than fixing everything and leaves the most threats without an owner', () => {
    const run = (ids: string[]) => ids.reduce((w, id) => choose(SPRINT, w, id), startWalk(SPRINT));
    const nothing = run(['transit-ignore', 'log-ignore', 'admin-ignore', 'partner-skip']);
    const fixAll = run(['transit-fix', 'log-fix', 'admin-fix', 'partner-rerun']);
    expect(nothing.meters[METER.effort]).toBeLessThan(fixAll.meters[METER.effort]);
    expect(nothing.meters[METER.ownerless]).toBe(3);
    expect(fixAll.meters[METER.ownerless]).toBe(0);
    expect(redMeters(SPRINT, startWalk(SPRINT).meters).map((m) => m.id)).toEqual([METER.risk, METER.ownerless]);
  });

  it('schedule slip is the effort past the sprint, and zero within it', () => {
    expect(slipOf(SPRINT_DAYS)).toBe(0);
    expect(slipOf(MAX_EFFORT)).toBe(MAX_EFFORT - SPRINT_DAYS);
  });
});

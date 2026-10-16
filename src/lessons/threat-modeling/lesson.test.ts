import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { choose, startWalk } from '../../core/scenario';
import { diagramCaption, mitigateCaption, sprintCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { CELLS, TARGETS, ZONES, applyControl, crossingFlows, metersOf, reveal, revealAll, startState, withPlacement, type Placement } from './model';
import { OPENING } from './opening';
import { SPRINT } from './sprint';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('threat-modeling');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('threat-modeling')).toEqual([]);
  });

  it('every scene opens on one fixed, pure state: nothing revealed, nothing mitigated, nothing selected', () => {
    expect(OPENING.scene).toBe('diagram');
    const a = OPENING.state();
    expect(a).toEqual(OPENING.state());
    expect(a.placement).toEqual({ orders: 'data', audit: 'app' });
    expect(Object.keys(a.revealed)).toEqual([]);
    expect(Object.keys(a.mitigated)).toEqual([]);
    expect(OPENING.selected).toBeNull();
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: 3 of 4 flows cross on the defaults, 4 with the log in the Data tier, 2 with the Orders DB in the App tier', () => {
    const s = startState();
    expect(crossingFlows(s.placement)).toHaveLength(3);
    expect(crossingFlows(withPlacement(s, { audit: 'data' }).placement)).toHaveLength(4);
    expect(crossingFlows(withPlacement(s, { orders: 'app' }).placement)).toHaveLength(2);
    expect([FACTS.crossingDefault, FACTS.crossingAuditInData, FACTS.crossingOrdersInApp, FACTS.flows]).toEqual([3, 4, 2, 4]);
    expect(lesson.tryThis[0]).toContain('3 of 4 flows cross');
  });

  it('try-this 2: the log has 4 categories, the store 3; one look reveals 1 of 29 and leaves 28 never looked at', () => {
    expect([FACTS.auditCategories, FACTS.ordersCategories, FACTS.cells]).toEqual([4, 3, 29]);
    const m = metersOf(reveal(startState(), 'orders:T'));
    expect([m.revealed, m.neverLooked]).toEqual([1, 28]);
    expect(lesson.tryThis[1]).toContain('1 of 29 threats are revealed and 28 cells were never looked at');
  });

  it('try-this 3: rate limiting is refused for the browser spoofing threat, strong authentication accepted, 1 of 29 mitigated', () => {
    const all = revealAll(startState());
    expect(applyControl(all, 'browser:S', 'rate-limit').kind).toBe('refused');
    const ok = applyControl(all, 'browser:S', 'authn');
    expect(ok.kind).toBe('accepted');
    expect(metersOf(ok.state).mitigated).toBe(1);
    expect(CELLS[0].id).toBe('browser:S');
    expect(FACTS.rateLimitCovers).toBe('D');
    expect(lesson.tryThis[2]).toContain('1 of 29 threats are mitigated');
  });

  it('try-this 4: fixing the first threat takes the known risk from 37 to 17 and effort to 3 of 5 days', () => {
    const w = choose(SPRINT, startWalk(SPRINT), 'transit-fix');
    expect([w.meters.risk, w.meters.effort]).toEqual([17, 3]);
    expect([FACTS.startRisk, FACTS.riskAfterFix, FACTS.effortAfterFix, FACTS.sprintDays]).toEqual([37, 17, 3, 5]);
    expect(lesson.tryThis[3]).toContain('drops from 37 to 17');
  });
});

describe('captions across the control cross product', () => {
  it('the diagram caption is clean for all 16 placements, with and without a selection and a revealed grid', () => {
    const placements: Placement[] = ZONES.flatMap((o) => ZONES.map((a) => ({ orders: o.id, audit: a.id })));
    for (const p of placements) {
      for (const base of [startState(), revealAll(startState())]) {
        const s = withPlacement(base, p);
        for (const selected of [null, ...TARGETS.map((t) => t.id)]) {
          const text = expectCaption(diagramCaption(s, selected));
          expect(text).not.toMatch(/NaN|undefined|\[object/);
          expect(text).toContain(`${crossingFlows(p).length === 0 ? 'No flow' : `${crossingFlows(p).length} of 4 flows`}`);
        }
      }
    }
  });

  it('the mitigation caption is clean at the start, with a selection, and after an accepted and a refused control', () => {
    const all = revealAll(startState());
    const accepted = applyControl(all, 'browser:S', 'authn');
    const refused = applyControl(all, 'browser:S', 'rate-limit');
    for (const [s, sel, last] of [
      [startState(), null, null], [all, null, null], [all, 'browser:S', null], [accepted.state, 'browser:S', accepted], [all, 'browser:S', refused],
    ] as const) {
      expect(expectCaption(mitigateCaption(s, sel, last))).not.toMatch(/NaN|undefined|\[object/);
    }
  });

  it('the sprint caption reads its numbers off the walk', () => {
    const start = startWalk(SPRINT);
    expect(expectCaption(sprintCaption(SPRINT, start))).toContain('Known residual risk 37 points, effort 0 days of 5');
    const slipped = ['transit-fix', 'log-fix', 'admin-fix'].reduce((w, id) => choose(SPRINT, w, id), start);
    expect(expectCaption(sprintCaption(SPRINT, slipped))).toContain('a slip of 2 days');
    const end = choose(SPRINT, slipped, 'partner-rerun');
    expect(expectCaption(sprintCaption(SPRINT, end))).toContain('The diagram was re-run.');
  });
});

describe('sprint option claims', () => {
  it('Do nothing costs the same days as Accepting and differs only in the owner, as its explanation says', () => {
    const start = startWalk(SPRINT);
    const accept = choose(SPRINT, start, 'transit-accept');
    const ignore = choose(SPRINT, start, 'transit-ignore');
    expect(ignore.meters.effort).toBe(accept.meters.effort);
    expect(ignore.meters.risk).toBe(accept.meters.risk);
    expect(ignore.meters.ownerless - accept.meters.ownerless).toBe(1);
    const because = SPRINT.nodes[0].choices.find((c) => c.id === 'transit-ignore')!.because!;
    expect(because).toContain('saves nothing');
    expect(because).not.toContain('what it saves (days)');
  });
});

describe('the lesson stays inside the simulation', () => {
  /** Allow-list: calls that would reach the network or run learner text. Empty on purpose. */
  const FORBIDDEN = /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\(|new Function/;

  it('has no network call and no eval in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    for (const [file, text] of Object.entries(sources)) expect(text, file).not.toMatch(FORBIDDEN);
  });

  it('shows the Simulated chip on every scene that draws the system', () => {
    for (const file of ['./DiagramScene.tsx', './MitigateScene.tsx']) expect(sources[file]).toContain('<Provenance kind="simulated">');
    expect(sources['./SprintScene.tsx']).toContain('PROVENANCE_NOTE');
  });
});

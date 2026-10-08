import { describe, expect, it } from 'vitest';
import { BAD, FIX_IDS, applyFixes, checklist, kindsIn, score, type Diagram, type FixId } from './diagram';
import {
  AUDIENCES, AUDIENCE_IDS, ELEMENTS, FOCUS, LEVELS, RELATIONS, ancestorAt, childrenOf, dimming, elementOf, frameTitle, isZoomable, labelText, lift,
  relationLevel, viewAt, type Level,
} from './model';

describe('the nested model', () => {
  it('every element at level n+1 has a parent at level n, and level 1 has none', () => {
    for (const e of ELEMENTS) {
      if (e.level === 1) expect(e.parent, e.id).toBeNull();
      else {
        expect(e.parent, e.id).not.toBeNull();
        expect(elementOf(e.parent!).level, e.id).toBe(e.level - 1);
      }
    }
  });

  it('ids are unique and every relationship joins two known, different elements, once', () => {
    expect(new Set(ELEMENTS.map((e) => e.id)).size).toBe(ELEMENTS.length);
    const keys = RELATIONS.map((r) => `${r.from}>${r.to}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of RELATIONS) {
      expect(() => elementOf(r.from)).not.toThrow();
      expect(() => elementOf(r.to)).not.toThrow();
      expect(r.from).not.toBe(r.to);
      expect(r.intent.length).toBeGreaterThan(0);
    }
  });

  it('context relationships carry no protocol; container-level and deeper ones to or from another process do', () => {
    for (const r of RELATIONS.filter((x) => relationLevel(x) === 1)) expect(r.protocol, `${r.from}>${r.to}`).toBeUndefined();
    const crossesProcess = (r: (typeof RELATIONS)[number]) => ancestorAt(r.from, 2) !== ancestorAt(r.to, 2);
    for (const r of RELATIONS.filter((x) => relationLevel(x) >= 2 && crossesProcess(x))) expect(r.protocol, `${r.from}>${r.to}`).toBeDefined();
  });

  it('only three boxes can be zoomed into, and they are the focus chain', () => {
    expect(ELEMENTS.filter((e) => isZoomable(e.id)).map((e) => e.id)).toEqual(['book', 'api', 'availability']);
    expect(LEVELS.map((l) => FOCUS[l])).toEqual([null, 'book', 'api', 'availability']);
  });
});

describe('each zoom shows exactly its parent\'s children', () => {
  for (const level of LEVELS) {
    it(`level ${level}`, () => {
      const v = viewAt(level);
      expect(v.children.map((c) => c.id).sort()).toEqual(ELEMENTS.filter((e) => e.parent === FOCUS[level]).map((e) => e.id).sort());
      expect(v.children.every((c) => c.level === level)).toBe(true);
      expect(childrenOf(FOCUS[level])).toEqual(v.children);
    });

    it(`level ${level}: surroundings are outside the focus, touch a child, and are never deeper than it`, () => {
      const v = viewAt(level);
      const inside = new Set(v.children.map((c) => c.id));
      for (const s of v.surroundings) {
        expect(inside.has(s.id)).toBe(false);
        expect(s.level).toBeLessThanOrEqual(level);
        expect(v.relations.some((r) => (r.from === s.id && inside.has(r.to)) || (r.to === s.id && inside.has(r.from)))).toBe(true);
      }
      // Every relationship in the view has an end among the children (nothing floats).
      for (const r of v.relations) expect(inside.has(r.from) || inside.has(r.to)).toBe(true);
    });
  }

  it('the four views together draw every relationship exactly once', () => {
    const drawn = LEVELS.flatMap((l) => viewAt(l).relations);
    expect(drawn).toHaveLength(RELATIONS.length);
  });
});

describe('zoom levels agree with each other (lifting a relationship to the coarser level)', () => {
  const edgesAt = (level: Level) => new Set(viewAt(level).relations.map((r) => `${r.from}>${r.to}`));

  for (const level of [2, 3, 4] as const) {
    it(`every level-${level} relationship is a level-${level - 1} relationship seen closer, or stays inside one box`, () => {
      const coarser = edgesAt((level - 1) as Level);
      for (const r of viewAt(level).relations) {
        const up = lift(r, (level - 1) as Level);
        if (up) expect(coarser.has(`${up.from}>${up.to}`), `${r.from}>${r.to} → ${up.from}>${up.to}`).toBe(true);
      }
    });

    it(`every level-${level - 1} relationship touching the zoomed box is explained one level down`, () => {
      const focus = FOCUS[level]!;
      const finer = viewAt(level).relations.map((r) => lift(r, (level - 1) as Level)).filter((x) => x !== null).map((x) => `${x!.from}>${x!.to}`);
      for (const r of viewAt((level - 1) as Level).relations.filter((x) => x.from === focus || x.to === focus)) {
        expect(finer, `${r.from}>${r.to}`).toContain(`${r.from}>${r.to}`);
      }
    });
  }

  it('the context level is realised in full: each of its relationships has at least one container-level relationship under it', () => {
    const lifted = new Set(viewAt(2).relations.map((r) => lift(r, 1)).filter((x) => x !== null).map((x) => `${x!.from}>${x!.to}`));
    for (const r of viewAt(1).relations) expect(lifted.has(`${r.from}>${r.to}`), `${r.from}>${r.to}`).toBe(true);
  });

  it('ancestorAt climbs to the right level and stops at the element itself when it is already coarse', () => {
    expect(ancestorAt('tableCalendar', 3)).toBe('availability');
    expect(ancestorAt('tableCalendar', 2)).toBe('api');
    expect(ancestorAt('tableCalendar', 1)).toBe('book');
    expect(ancestorAt('payments', 3)).toBe('payments');
    expect(ancestorAt('db', 4)).toBe('db');
  });
});

describe('labels and titles', () => {
  it('shows the protocol in brackets only when there is one', () => {
    expect(labelText({ intent: 'Books a table' })).toBe('Books a table');
    expect(labelText({ intent: 'Reads and writes', protocol: 'SQL/TCP' })).toBe('Reads and writes [SQL/TCP]');
  });

  it('frame titles come from the element', () => {
    expect(frameTitle('book')).toBe('BOOK A TABLE [SOFTWARE SYSTEM]');
    expect(frameTitle('api')).toBe('API [CONTAINER: NODE.JS, REST]');
    expect(frameTitle('availability')).toBe('AVAILABILITY SERVICE [COMPONENT]');
  });
});

describe('audiences', () => {
  it('every audience\'s level exists and has a diagram', () => {
    for (const id of AUDIENCE_IDS) {
      const a = AUDIENCES[id];
      if (a.level !== null) expect(viewAt(a.level).children.length).toBeGreaterThan(0);
      expect(a.question.length).toBeGreaterThan(0);
    }
  });

  it('dims everything at other levels, and only the unwanted detail at their own level', () => {
    expect(dimming(AUDIENCES.all, 3)).toEqual({ whole: false, tech: false, protocol: false });
    expect(dimming(AUDIENCES.exec, 2)).toEqual({ whole: true, tech: false, protocol: false });
    expect(dimming(AUDIENCES.exec, 1)).toEqual({ whole: false, tech: true, protocol: true });
    expect(dimming(AUDIENCES.engineer, 2)).toEqual({ whole: false, tech: false, protocol: true });
    expect(dimming(AUDIENCES.oncall, 2)).toEqual({ whole: false, tech: false, protocol: false });
    expect(dimming(AUDIENCES.oncall, 4).whole).toBe(true);
  });

  it('the executive\'s level has no technology in it to dim: context shows no tech and no protocol at all', () => {
    expect(viewAt(1).children.every((c) => c.tech === undefined)).toBe(true);
    expect(viewAt(1).relations.every((r) => r.protocol === undefined)).toBe(true);
  });
});

// ---- the bad-diagram scene ----

const subsets = (): Set<FixId>[] =>
  Array.from({ length: 1 << FIX_IDS.length }, (_, mask) => new Set(FIX_IDS.filter((_, i) => (mask >> i) & 1)));

/** Independent reference: recompute each check from the raw arrays with plain loops. */
function reference(d: Diagram): Record<FixId, boolean> {
  let unlabelled = 0;
  for (const e of d.edges) if (!(e.intent && e.intent.trim() && e.protocol && e.protocol.trim())) unlabelled++;
  let tooDeep = 0;
  let untyped = 0;
  for (const e of d.elements) {
    if (e.level > d.level) tooDeep++;
    if (e.kind === null) untyped++;
    else if (e.kind === 'container' && !(e.tech && e.tech.trim())) untyped++;
  }
  return { labels: unlabelled === 0, oneLevel: tooDeep === 0, legend: d.legend === true, title: !!(d.title && d.title.trim()), tech: untyped === 0 };
}

describe('the bad diagram and its readability checklist', () => {
  it('starts failing every check: 0 of 5', () => {
    expect(checklist(BAD).map((c) => c.ok)).toEqual([false, false, false, false, false]);
    expect(score(BAD)).toBe(0);
  });

  it('a vague label is not enough: "uses" with no protocol still fails', () => {
    const d: Diagram = { ...BAD, edges: BAD.edges.map((e) => ({ ...e, intent: e.intent ?? 'uses' })) };
    expect(checklist(d).find((c) => c.id === 'labels')!.ok).toBe(false);
    expect(BAD.edges[0].intent).toBe('uses');
  });

  it('for all 32 subsets of fixes, each check passes exactly when its own fix is ticked, and agrees with the reference', () => {
    for (const fixes of subsets()) {
      const d = applyFixes(fixes);
      const items = Object.fromEntries(checklist(d).map((c) => [c.id, c.ok]));
      const ref = reference(d);
      for (const id of FIX_IDS) {
        expect(items[id], `${[...fixes].join('+')} / ${id}`).toBe(fixes.has(id));
        expect(items[id]).toBe(ref[id]);
      }
      expect(score(d)).toBe(fixes.size);
    }
  });

  it('folding replaces the table with its database, rewires the arrow and drops nothing else', () => {
    const d = applyFixes(new Set<FixId>(['oneLevel']));
    expect(d.elements.map((e) => e.id).sort()).toEqual(['api', 'db', 'diner', 'payments', 'web']);
    expect(d.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(['api>db', 'api>payments', 'diner>web', 'web>api']);
    expect(d.elements.every((e) => e.level <= d.level)).toBe(true);
  });

  it('the fully fixed diagram labels every arrow the way the real container view does', () => {
    const d = applyFixes(new Set(FIX_IDS));
    const real = new Map(viewAt(2).relations.map((r) => [`${r.from}>${r.to}`, labelText(r)]));
    for (const e of d.edges) expect(labelText({ intent: e.intent!, protocol: e.protocol! }), `${e.from}>${e.to}`).toBe(real.get(`${e.from}>${e.to}`));
  });

  it('the key explains exactly the kinds that are drawn', () => {
    expect(kindsIn(BAD)).toEqual([]);
    expect(kindsIn(applyFixes(new Set(FIX_IDS))).sort()).toEqual(['container', 'external', 'person']);
  });
});

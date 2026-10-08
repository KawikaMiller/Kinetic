import { describe, expect, it } from 'vitest';
import { L_CODE, VARIANTS, type Design, type PrincipleId, type Unit } from './code';
import { breaks, buildFrames, impactOf } from './frames';
import { changedLines, dependencies, impact, renderListing, stubCount, touchedCount } from './model';
import { PRINCIPLE_IDS } from './principles';
import { L_CALLS, isBaseline, programText, runAll, substitutions } from './run';

type Changing = Exclude<PrincipleId, 'L'>;
const CHANGING: Changing[] = ['S', 'O', 'I', 'D'];
const DESIGNS: Design[] = ['violating', 'fixed'];

/** Hand-worked from code.ts: what each change edits, adds and forces a re-test of. */
const HAND: Record<Changing, Record<Design, { edited: string[]; added: string[]; retest: string[] }>> = {
  S: {
    violating: { edited: ['Report'], added: [], retest: ['Dashboard', 'MonthlyJob'] },
    fixed: { edited: ['PdfLayout'], added: [], retest: ['MonthlyJob'] },
  },
  O: {
    violating: { edited: ['Exporter'], added: [], retest: ['ReportJob', 'AdminPage'] },
    fixed: { edited: ['exporterFor'], added: ['CsvExporter'], retest: ['main'] },
  },
  I: {
    violating: { edited: ['Printer', 'OfficePrinter', 'SimpleScanner'], added: [], retest: ['ScanApp', 'PrintApp'] },
    fixed: { edited: ['Printing', 'OfficePrinter'], added: [], retest: ['PrintApp'] },
  },
  D: {
    violating: { edited: ['ReportService'], added: ['CachedRepo'], retest: ['ReportJob'] },
    fixed: { edited: ['main'], added: ['CachedRepo'], retest: [] },
  },
};

/** Independent diff: compare each unit's raw structure, not its printed text. */
const structurallyChanged = (before: Unit[], after: Unit[]) =>
  after.filter((u) => {
    const old = before.find((b) => b.name === u.name);
    return old && JSON.stringify(old) !== JSON.stringify(u);
  }).map((u) => u.name);

describe('change impact per principle × design', () => {
  for (const p of CHANGING) {
    for (const d of DESIGNS) {
      it(`${p} ${d}`, () => {
        const { before, after } = VARIANTS[p][d];
        const im = impact(before, after);
        expect({ edited: im.edited, added: im.added, retest: im.retest }).toEqual(HAND[p][d]);
        expect(im.removed).toEqual([]);
        expect(im.edited).toEqual(structurallyChanged(before, after));
        // Every unit lands in exactly one bucket.
        const all = [...im.edited, ...im.added, ...im.retest, ...im.untouched].sort();
        expect(all).toEqual(after.map((u) => u.name).sort());
      });
    }
  }

  it('the fixed design touches fewer classes for S, I and D, and ties for O (3 and 3), which the O caption says', () => {
    for (const p of ['S', 'I', 'D'] as const) expect(touchedCount(impactOf(p, 'fixed')), p).toBeLessThan(touchedCount(impactOf(p, 'violating')));
    expect(touchedCount(impactOf('O', 'fixed'))).toBe(3);
    expect(touchedCount(impactOf('O', 'violating'))).toBe(3);
    const last = buildFrames('O', 'fixed').at(-1)!;
    expect(last.say).toContain('The count ties');
  });

  it('the fixed O and D designs never open an existing class: only the wiring function changes', () => {
    expect(impactOf('O', 'fixed').edited).toEqual(['exporterFor']);
    expect(impactOf('D', 'fixed').edited).toEqual(['main']);
  });

  it('the stubs are exactly the methods a scanner cannot do: emailScan is real code in both designs', () => {
    const stubs = (v: Unit[]) => v.find((u) => u.name === 'SimpleScanner')!.members.filter((m) => m.lines.some((l) => l.includes("'not supported'"))).map((m) => m.name);
    expect(stubs(VARIANTS.I.violating.before)).toEqual(['print', 'fax', 'staple', 'copy']);
    expect(stubs(VARIANTS.I.violating.after)).toEqual(['print', 'printDuplex', 'fax', 'staple', 'copy']);
    const emailScan = (v: Unit[]) => v.find((u) => u.name === 'SimpleScanner')!.members.find((m) => m.name === 'emailScan')!.lines.join(' ');
    expect(emailScan(VARIANTS.I.violating.before)).toBe(emailScan(VARIANTS.I.fixed.before));
    expect(buildFrames('I', 'violating').at(-1)!.say).toContain('now stubs 5 methods (it had 4)');
  });

  it('the fat interface forces stubs on SimpleScanner, and the change adds one more', () => {
    expect(stubCount(VARIANTS.I.violating.before, 'SimpleScanner')).toBe(4);
    expect(stubCount(VARIANTS.I.violating.after, 'SimpleScanner')).toBe(5);
    expect(stubCount(VARIANTS.I.fixed.after, 'SimpleScanner')).toBe(0);
  });
});

describe('dependencies are read off the code', () => {
  const edges = (v: Unit[]) => dependencies(v).map((e) => `${e.from} ${e.kind} ${e.to}`).sort();

  it('O fixed, before the change', () => {
    expect(edges(VARIANTS.O.fixed.before)).toEqual(
      [
        'PdfExporter implements Exporter', 'HtmlExporter implements Exporter', 'ReportJob uses Exporter', 'AdminPage uses Exporter',
        'exporterFor uses PdfExporter', 'exporterFor uses HtmlExporter', 'main uses ReportJob', 'main uses AdminPage', 'main uses exporterFor',
      ].sort(),
    );
  });

  it('a name inside a longer name is not a dependency (PdfExporter does not mention Exporter by name)', () => {
    const e = edges(VARIANTS.O.fixed.before);
    expect(e.filter((x) => x.startsWith('PdfExporter'))).toEqual(['PdfExporter implements Exporter']);
  });

  it('L: inheritance from the declaration, and the JSDoc type as a use', () => {
    expect(edges(L_CODE.violating)).toEqual(['ReadOnlyFile extends File', 'saveAll uses File']);
    expect(edges(L_CODE.fixed)).toEqual(['ReadOnlyFile extends File', 'WritableFile extends File', 'readAll uses File', 'saveAll uses WritableFile'].sort());
  });

  it('I violating: every app and device hangs off the one Printer interface', () => {
    expect(edges(VARIANTS.I.violating.before)).toEqual(
      ['OfficePrinter implements Printer', 'SimpleScanner implements Printer', 'ScanApp uses Printer', 'PrintApp uses Printer'].sort(),
    );
  });
});

describe('the listing', () => {
  it('highlights exactly the new lines of the O violating change (one new case)', () => {
    const { before, after } = VARIANTS.O.violating;
    const lines = renderListing(after);
    expect([...changedLines(before, after)].map((i) => lines[i].text.trim())).toEqual(["case 'csv': return toCsv(rows);"]);
  });

  it('marks every line of an added class as changed', () => {
    const { before, after } = VARIANTS.O.fixed;
    const lines = renderListing(after);
    const changed = [...changedLines(before, after)].map((i) => lines[i]);
    expect(changed.filter((l) => l.unit === 'CsvExporter')).toHaveLength(3);
    expect(changed.filter((l) => l.unit === 'exporterFor').map((l) => l.text.trim())).toEqual(['csv: new CsvExporter(),']);
  });
});

describe('L: the substitution run is real JavaScript', () => {
  it('the violating design throws a real TypeError when saveAll gets a ReadOnlyFile', () => {
    const [ok, bad] = runAll('violating');
    expect(ok.ok).toBe(true);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.isTypeError).toBe(true);
      expect(bad.message).toBe('archive.txt is read-only');
    }
  });

  it('...yet the same code is a perfectly valid subclass as far as JavaScript is concerned', () => {
    const check = new Function(`${programText('violating')}\nconst f = new ReadOnlyFile('a'); return [f instanceof File, typeof f.write];`)();
    expect(check).toEqual([true, 'function']);
  });

  it('only calls that hand a subclass to base-type code count as substitutions; baselines are labelled and left out', () => {
    expect(substitutions('violating').map((r) => r.call.subclass)).toEqual(['ReadOnlyFile']);
    expect(substitutions('fixed').map((r) => r.call.subclass)).toEqual(['WritableFile', 'ReadOnlyFile']);
    for (const d of DESIGNS) for (const c of L_CALLS[d]) expect(isBaseline(c), c.code).toBe(c.subclass === c.base);
    const out = buildFrames('L', 'violating').at(-1)!.console.map((l) => l.text);
    expect(out.filter((t) => t.includes('baseline'))).toHaveLength(1);
    expect(breaks('violating')).toBe(1);
  });

  it('the fixed design runs every call', () => {
    const results = runAll('fixed');
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([['report.txt: 0 chars'], ['archive.txt: 0 chars'], ['report.txt: wrote 9 chars']]);
    expect(breaks('fixed')).toBe(0);
    expect(breaks('violating')).toBe(1);
  });

  it('every call names a subclass that the code really declares', () => {
    for (const d of DESIGNS) for (const c of L_CALLS[d]) expect(L_CODE[d].map((u) => u.name)).toContain(c.subclass);
  });
});

describe('frames: every principle × design', () => {
  it('the change starts in a class that is already in the diagram (never in one the change adds)', () => {
    for (const p of CHANGING) {
      for (const d of DESIGNS) {
        const frames = buildFrames(p, d);
        const start = Object.keys(frames[1].marks);
        expect(start).toHaveLength(1);
        expect(VARIANTS[p][d].before.map((u) => u.name), `${p} ${d}`).toContain(start[0]);
      }
    }
  });

  for (const p of PRINCIPLE_IDS) {
    for (const d of DESIGNS) {
      it(`${p} ${d} ends on a caption computed from the run`, () => {
        const frames = buildFrames(p, d);
        const last = frames[frames.length - 1];
        if (p === 'L') {
          expect(last.say).toContain(d === 'violating' ? '1 of 1 substitution broke' : '2 of 2 substitutions work');
          expect(last.console.some((l) => l.tone === 'bad')).toBe(d === 'violating');
        } else {
          const n = touchedCount(impactOf(p, d));
          const m = touchedCount(impactOf(p, d === 'violating' ? 'fixed' : 'violating'));
          expect(last.say).toContain(`${n} touched (`);
          expect(last.say).toContain(`touches ${m}.`);
          // Every class wears a mark by the end of the ripple.
          expect(Object.keys(last.marks).sort()).toEqual(VARIANTS[p][d].after.map((u) => u.name).sort());
        }
        for (const f of frames) expect(f.say.length).toBeGreaterThan(0);
      });
    }
  }
});

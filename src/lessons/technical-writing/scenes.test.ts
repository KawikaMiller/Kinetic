import { describe, expect, it } from 'vitest';
import { DETAILS, READERS, VERSIONS, explainFit, fitOf, keptBy, type Fit } from './readers';
import { CHIPS, FACTS, SLOTS, chipsFor, factsUsed, missingSlots, paragraphOf, place, recommendationAt, verdictOf, WEAK_VERSION, type Assembly } from './tradeoff';
import { sentencesOf } from './textStats';

describe('trade-off chips', () => {
  it('offers one strong and at least two weak sentences for every slot', () => {
    for (const s of SLOTS) {
      const chips = chipsFor(s.id);
      expect(chips.filter((c) => c.strong)).toHaveLength(1);
      expect(chips.filter((c) => !c.strong).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives every weak sentence a reason and every strong one at least one supporting fact', () => {
    for (const c of CHIPS) {
      if (c.strong) expect(c.uses.length).toBeGreaterThan(0);
      else expect(c.flaw).toBeTruthy();
    }
  });

  it('only cites facts that exist, and every fact is used by some strong sentence', () => {
    const ids = new Set(FACTS.map((f) => f.id));
    for (const c of CHIPS) for (const f of c.uses) expect(ids.has(f)).toBe(true);
    const used = new Set(CHIPS.flatMap((c) => (c.strong ? c.uses : [])));
    for (const f of FACTS) expect(used.has(f.id)).toBe(true);
  });

  it('makes each slot one sentence, so a paragraph has exactly the sentences placed', () => {
    for (const c of CHIPS) expect(sentencesOf(c.text)).toHaveLength(1);
  });

  it('keeps weak sentences the same length class as strong ones, so length does not give the answer away', () => {
    for (const s of SLOTS) {
      const [strong] = chipsFor(s.id).filter((c) => c.strong);
      for (const weak of chipsFor(s.id).filter((c) => !c.strong)) expect(weak.text.length).toBeLessThan(strong.text.length * 1.3);
    }
  });
});

describe('assembling a summary', () => {
  const strong = (): Assembly => Object.fromEntries(SLOTS.map((s) => [s.id, chipsFor(s.id).find((c) => c.strong)!.id]));

  it('starts with every slot missing', () => {
    expect(missingSlots({})).toEqual(SLOTS.map((s) => s.id));
    expect(verdictOf({})).toBe('empty');
  });

  it('flags exactly the slots not yet filled, in order', () => {
    const a = place(place({}, 'ctx-good'), 'give-good');
    expect(missingSlots(a)).toEqual(['options', 'recommendation', 'revisit']);
    expect(verdictOf(a)).toBe('incomplete');
  });

  it('picking another chip for a slot replaces it, and picking the same chip takes it out', () => {
    let a = place({}, 'ctx-good');
    a = place(a, 'ctx-vague');
    expect(a.context).toBe('ctx-vague');
    a = place(a, 'ctx-vague');
    expect(a.context).toBeUndefined();
  });

  it('is strong only when all five slots hold strong sentences', () => {
    expect(verdictOf(strong())).toBe('strong');
    expect(verdictOf({ ...strong(), recommendation: 'rec-vague' })).toBe('weak');
  });

  it('reads the slots in order whatever order the chips were placed', () => {
    const reversed = [...SLOTS].reverse().reduce<Assembly>((a, s) => place(a, chipsFor(s.id).find((c) => c.strong)!.id), {});
    expect(paragraphOf(reversed)).toBe(paragraphOf(strong()));
    expect(sentencesOf(paragraphOf(strong()))).toHaveLength(SLOTS.length);
  });

  it('puts the recommendation in the strong summary and nowhere in the weak version', () => {
    expect(recommendationAt(paragraphOf(strong()))).not.toBeNull();
    expect(recommendationAt(WEAK_VERSION)).toBeNull();
    expect(recommendationAt(paragraphOf({ ...strong(), recommendation: 'rec-vague' }))).toBeNull();
  });

  it('lists the weak version\'s facts but no pick, no cost and no trigger', () => {
    expect(WEAK_VERSION).not.toMatch(/recommend|give up|revisit|we would/i);
    expect(WEAK_VERSION).toContain('Postgres');
  });

  it('tracks which facts the placed sentences rest on', () => {
    expect([...factsUsed({})]).toEqual([]);
    expect(factsUsed(strong()).size).toBe(FACTS.length);
    expect([...factsUsed({ context: 'ctx-vague' })]).toEqual([]);
  });
});

describe('same facts, three readers', () => {
  it('writes each version for a different reader', () => {
    expect(new Set(VERSIONS.map((v) => v.reader)).size).toBe(READERS.length);
  });

  it('is not in the order exec, peer, SRE, so position gives nothing away', () => {
    expect(VERSIONS.map((v) => v.reader)).not.toEqual(['exec', 'peer', 'sre']);
  });

  it('keeps exactly the details each reader needs, read off the text of the version', () => {
    for (const v of VERSIONS) {
      const needs = READERS.find((r) => r.id === v.reader)!.needs;
      expect([...keptBy(v)].sort()).toEqual([...needs].sort());
    }
  });

  it('fits only the reader it was written for', () => {
    for (const v of VERSIONS) {
      for (const r of READERS) expect(fitOf(v, r.id).fits).toBe(r.id === v.reader);
    }
  });

  it('every detail is kept by at least one version, and only how to undo it is kept by all three', () => {
    const keptByAll = DETAILS.filter((d) => VERSIONS.every((v) => keptBy(v).includes(d.id)));
    expect(keptByAll.map((d) => d.id)).toEqual(['rollback']);
    for (const d of DETAILS) expect(VERSIONS.some((v) => keptBy(v).includes(d.id))).toBe(true);
  });

  it('keeps the executive version free of settings and flag names', () => {
    const exec = VERSIONS.find((v) => v.reader === 'exec')!;
    expect(exec.text).not.toMatch(/payments_retry_v2|200 ms|backoff|1\.7x/);
  });

  it('explains a mismatch with what is missing and what is wasted, and a match as a fit', () => {
    const sre = VERSIONS.find((v) => v.reader === 'sre')!;
    const wrong: Fit = fitOf(sre, 'exec');
    expect(wrong.fits).toBe(false);
    expect(wrong.missing).toContain('money');
    expect(wrong.extra).toContain('watch');
    expect(explainFit(wrong, 'exec')).toMatch(/^Not a fit: /);
    expect(explainFit(wrong, 'exec')).toContain('business value');
    expect(explainFit(wrong, 'exec')).toContain('what to watch');
    expect(explainFit(fitOf(sre, 'sre'), 'sre')).toMatch(/^Fits:/);
    expect(explainFit(wrong, 'exec')).toContain('an executive needs');
    expect(explainFit(fitOf(sre, 'peer'), 'peer')).toContain('a peer engineer needs');
  });

  it('is a short text: each version fits in 70 words', () => {
    for (const v of VERSIONS) expect(v.text.split(/\s+/).length).toBeLessThan(70);
  });
});

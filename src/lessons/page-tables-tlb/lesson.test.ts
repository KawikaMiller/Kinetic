import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FLAT_TEXT, accessCaption, shootdownCaption, stepCaption, switchCaption, tlbSummary, walkSummary } from './captions';
import { switchFacts, tlbFacts, walkFacts } from './facts';
import { tlbFrames, walkFrames } from './frames';
import lesson from './index';
import { DEFAULT_MAPPINGS, choiceOpening, spaceFor, walk, walkOpening } from './paging';
import { ENTRY_OPTIONS, PATTERNS, WORKING_SET, runSwitching, runTlb, shootdown, shootdownOpening, switchOpening, tlbOpening, type TlbConfig } from './tlb';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

describe('scene switches', () => {
  it('every scene is its own component and carries its own key, so no scene opens on another scene\'s state', () => {
    expect(sceneElements('page-tables-tlb')).toHaveLength(3);
    expect(sharedSceneComponents('page-tables-tlb')).toEqual([]);
    expect(sceneElements('page-tables-tlb').every((e) => e.keyed)).toBe(true);
  });

  it('each scene\'s opening state is the one its try-this assumes', () => {
    const w = walkOpening();
    expect(w.choice).toEqual(choiceOpening());
    expect(w.address).toBe(DEFAULT_MAPPINGS.find((m) => m.size === 'p4k')!.sample);
    expect(tlbOpening()).toEqual({ entries: 8, size: 'p4k', pattern: 'sequential', workingSet: 10, stride: 4 });
    expect(switchOpening()).toEqual({ workingSet: 6, slice: 24 });
    expect(shootdownOpening()).toEqual({ cores: 4, unmaps: 4, batched: false });
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: a 4-reference walk to the sample address, in a space of tables far smaller than 512 GiB', () => {
    const f = walkFacts();
    expect(f.refs).toBe(4);
    expect(f.tables).toBeGreaterThan(12);
    expect(f.physical).toMatch(/^0x2000/);
    expect(FLAT_TEXT).toBe('512.0 GiB');
    expect(lesson.tryThis[0]).toContain(`makes 4 memory references and ends at physical address ${f.physical}`);
    expect(lesson.tryThis[0]).toContain(`holds ${f.tables} tables`);
  });

  it('try-this 2: choosing 2 MiB ends the walk after 3 references with a 21-bit offset', () => {
    const f = walkFacts();
    expect([f.hugeRefs, f.hugeOffsetBits]).toEqual([3, 21]);
    expect(lesson.tryThis[1]).toContain('after 3 references, and 21 bits');
  });

  it('try-this 3: unmapping leaves the tables and the walk reads 4 entries and faults at the PT', () => {
    const f = walkFacts();
    expect([f.faultRefs, f.faultLevel]).toEqual([4, 'PT']);
    expect(lesson.tryThis[2]).toContain('reads 4 entries and finds the PT entry not present');
  });

  it('try-this 4: all 128 accesses miss at 10 pages, 8 miss at 8 pages (93.8%), 1 miss on 2 MiB pages (99.2%)', () => {
    const f = tlbFacts();
    expect([f.openingMisses, f.openingHits, f.accesses]).toEqual([128, 0, 128]);
    expect([f.eightMisses, f.eightRate]).toEqual([8, '93.8%']);
    expect([f.hugeMisses, f.hugeRate]).toEqual([1, '99.2%']);
    // hand-worked: 8 compulsory misses in 128 accesses is 120 / 128 = 0.9375; one miss is 127 / 128 = 0.9921875
    expect((128 - 8) / 128).toBe(0.9375);
    expect(lesson.tryThis[3]).toContain('all 128 of 128 accesses miss');
    expect(lesson.tryThis[3]).toContain('a hit rate of 93.8%');
  });

  it('try-this 5: flushing makes more misses than tags, and 4 cores x 4 unmaps is 12 IPIs, 3 batched', () => {
    const f = switchFacts();
    expect(f.flushMisses).toBeGreaterThan(f.asidMisses);
    expect([f.ipis, f.batchedIpis]).toEqual([12, 3]);
    expect(lesson.tryThis[4]).toContain(`makes ${f.flushMisses} misses against ${f.asidMisses}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    expect(lesson.tryThis[4]).toContain('sends 12 IPIs; Batched sends 3');
  });
});

describe('captions say what the model did', () => {
  it('the walk captions and summaries agree with the walk, for every sample and a fault and a non-canonical address', () => {
    const cases = [...DEFAULT_MAPPINGS.map((m) => m.sample), 0x1234n, 0x0000_8000_0000_0000n];
    for (const va of cases) {
      const space = spaceFor(va, choiceOpening());
      const result = walk(space, va);
      const frames = walkFrames(result, space.tables.length);
      expect(frames).toHaveLength(result.steps.length + 2);
      frames.forEach((f) => text(f.say));
      result.steps.forEach((s, k) => expect(text(stepCaption(s, k))).toContain(`Reference ${k + 1}`));
      const summary = text(walkSummary(result, space.tables.length));
      expect(summary.includes('Page fault')).toBe(!result.ok && result.reason === 'not-present');
      expect(summary.includes('Not canonical')).toBe(!result.ok && result.reason === 'not-canonical');
      expect(summary.includes(`${result.memoryRefs} memory reference`) || !result.ok).toBe(true);
    }
  });

  it('the TLB captions say "every access misses" only when the run had no hit, across entries, patterns and working-set extremes', () => {
    for (const entries of ENTRY_OPTIONS) {
      for (const pattern of PATTERNS) {
        for (const workingSet of [WORKING_SET.min, 8, WORKING_SET.default, WORKING_SET.max]) {
          for (const size of ['p4k', 'p2m'] as const) {
            const cfg: TlbConfig = { ...tlbOpening(), entries, pattern, workingSet, size };
            const run = runTlb(cfg);
            const say = text(tlbSummary(cfg, run));
            expect(say.includes('every access misses')).toBe(run.hits === 0 && pattern === 'sequential' && new Set(run.steps.map((s) => s.vpn)).size > entries);
            expect(say).toContain(`${run.hits} of ${run.hits + run.misses}`);
            const tlbF = tlbFrames(cfg, run);
            expect(tlbF).toHaveLength(run.steps.length + 2);
            text(accessCaption(run.steps[0], cfg, run));
          }
        }
      }
    }
  });

  it('the switch and shootdown captions quote the model\'s counts at the slider extremes', () => {
    for (const workingSet of [2, 16]) {
      for (const slice of [4, 64]) {
        const flush = runSwitching({ workingSet, slice }, 'flush');
        const asid = runSwitching({ workingSet, slice }, 'asid');
        const say = text(switchCaption(flush, asid));
        expect(say).toContain(`${flush.misses} misses`);
        expect(say).toContain(`${asid.misses} misses`);
      }
    }
    for (const cores of [1, 16]) {
      for (const batched of [true, false]) {
        const cfg = { cores, unmaps: 8, batched };
        const r = shootdown(cfg);
        const say = text(shootdownCaption(cfg, r));
        expect(say).toContain(`${r.ipis} IPI`);
        expect(say).toContain(`${r.cost.toLocaleString('en-US')} cycles`);
      }
    }
  });

  it('the stride slider feeds only the stride pattern (the control cross product)', () => {
    for (const pattern of ['sequential', 'random'] as const) {
      const rates = [1, 8, 16].map((stride) => runTlb({ ...tlbOpening(), pattern, stride }).hits);
      expect(new Set(rates).size).toBe(1);
    }
    expect(new Set([1, 2, 16].map((stride) => runTlb({ ...tlbOpening(), pattern: 'stride', stride, workingSet: 64 }).misses)).size).toBeGreaterThan(1);
  });
});

describe('honesty and quiz', () => {
  it('no model file reads a clock, starts a timer or touches the network', () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts') && !name.endsWith('.tsx'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const [name, source] of files) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
      expect(code, name).not.toMatch(/performance\.now|Date\.now|new Date|setTimeout|setInterval|requestAnimationFrame|fetch\(/);
    }
  });

  it('the correct quiz option is the strictly longest in at most half the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(lesson.quiz.length / 2);
  });

  it('the quiz numbers come from the model', () => {
    expect(shootdown({ cores: 8, unmaps: 1, batched: false }).ipis).toBe(7);
    expect(shootdown({ cores: 16, unmaps: 1, batched: false }).ipis).toBe(15);
    expect(lesson.quiz[4].options[0]).toBe('7');
    expect(runTlb({ ...tlbOpening(), entries: 8, workingSet: 10 }).hits).toBe(0);
    expect(lesson.quiz[1].options[0]).toBe('0%');
    expect(lesson.quiz[3].options[0]).toBe('3 entries and 21 offset bits');
  });
});

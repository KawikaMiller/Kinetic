import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { crashStartCaption, corpusCaption, minimiseDoneCaption, minimiseStepCaption, noCrashCaption, oracleCaption, probeCaption, raceCaption } from './captions';
import { FACTS } from './facts';
import { MAX_EXECUTIONS, MIN_EXECUTIONS, bucketCrashes, runFuzz } from './fuzzer';
import { minimiseFrames } from './frames';
import lesson from './index';
import { parseHexBytes } from './hexInput';
import { crashesAt, minimise } from './minimise';
import { largestCrash, logRowsOf, totalEdges } from './model';
import { DEFAULT_SEED, PROBE_DEFAULT, initialCorpus, initialCrash, initialOracle, initialRace } from './opening';
import { runTarget, type TargetOptions } from './target';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CLEAN = /NaN|undefined|\[object|null/;
const BYTEWISE: TargetOptions = { magic: 'bytewise', boundsCheck: true };

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('fuzzing');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('fuzzing')).toEqual([]);
  });

  it('each scene opens on its own state, a pure function that nothing else mutates', () => {
    const a = [initialRace(), initialCorpus(), initialCrash(), initialOracle()];
    const b = [initialRace(), initialCorpus(), initialCrash(), initialOracle()];
    expect(a).toEqual(b);
    for (const s of a) {
      expect(s.seed).toBe(DEFAULT_SEED);
      expect(s.executions).toBeGreaterThanOrEqual(MIN_EXECUTIONS);
      expect(s.executions).toBeLessThanOrEqual(MAX_EXECUTIONS);
    }
    expect(a[0]).toMatchObject({ magic: 'bytewise', shown: 'guided' });
    expect(a[3]).toMatchObject({ boundsCheck: true, hex: PROBE_DEFAULT });
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: guided covers 17 of 17 edges, first crash at 6,889, blind 3; the one-comparison check leaves guided at 1 of 11', () => {
    const race = initialRace();
    const guided = runFuzz({ kind: 'guided', seed: race.seed, executions: race.executions, target: BYTEWISE });
    const blind = runFuzz({ kind: 'blind', seed: race.seed, executions: race.executions, target: BYTEWISE });
    expect([guided.edges.size, totalEdges('bytewise'), guided.firstCrashAt, blind.edges.size]).toEqual([17, 17, 6889, 3]);
    expect(guided.magicAt).toBe(6861);
    expect([FACTS.guidedEdges, FACTS.total, FACTS.guidedFirstCrash, FACTS.blindEdges, FACTS.guidedMagicAt, FACTS.guidedSingleEdges, FACTS.totalSingle]).toEqual([17, 17, 6889, 3, 6861, 1, 11]);
    expect(blind.crashes).toHaveLength(0);
    const single = runFuzz({ kind: 'guided', seed: race.seed, executions: race.executions, target: { magic: 'single', boundsCheck: true } });
    expect([single.edges.size, totalEdges('single'), single.magicAt]).toEqual([1, 11, null]);
    expect(lesson.tryThis[0]).toContain('guided covers 17 of 17 edges');
    expect(lesson.tryThis[0]).toContain('execution 6,889');
    expect(expectCaption(raceCaption(blind, guided, 17, 'bytewise'))).toContain('guided covers 17 of 17 edges (first crash at execution 6,889)');
  });

  it('try-this 2: the corpus has 12 entries and entry #11 came from #9 and added b8 to b9', () => {
    const opening = initialCorpus();
    expect(opening.selected).toBe(0);
    const run = runFuzz({ kind: 'guided', seed: opening.seed, executions: opening.executions, target: BYTEWISE });
    expect(run.corpus).toHaveLength(12);
    const entry = run.corpus[11];
    expect([entry.parent, entry.newEdges.length]).toEqual([9, 1]);
    expect([FACTS.corpusSize, FACTS.lastEntryId, FACTS.lastEntryParent, FACTS.lastEntryEdges]).toEqual([12, 11, 9, ['b8 to b9']]);
    expect(expectCaption(corpusCaption(entry, 12))).toContain('Entry #11 came from entry #9');
    expect(expectCaption(corpusCaption(entry, 12))).toContain('b8 to b9');
    expect(lesson.tryThis[1]).toContain('entry #9');
  });

  it('try-this 3: 1,612 crashes in 2 buckets, and the largest b6 input shrinks from 14 bytes to 5 in 15 tries', () => {
    const opening = initialCrash();
    const run = runFuzz({ kind: 'guided', seed: opening.seed, executions: opening.executions, target: BYTEWISE });
    const buckets = bucketCrashes(run.crashes);
    expect([run.crashes.length, buckets.map((b) => b.site)]).toEqual([1612, [6, 8]]);
    const largest = largestCrash(run.crashes, 6)!;
    const min = minimise(largest.bytes, (b) => crashesAt(b, 6, BYTEWISE));
    expect([largest.bytes.length, min.result.length, min.steps.length]).toEqual([14, 5, 15]);
    expect([FACTS.crashes, FACTS.bucketSites, FACTS.largestLength, FACTS.minimisedLength, FACTS.minimiseTries]).toEqual([1612, [6, 8], 14, 5, 15]);
    const frames = minimiseFrames(run, largest.bytes, min, 6);
    expect(frames).toHaveLength(min.steps.length + 2);
    expect(expectCaption(frames[0].say)).toContain('1,612 crashing inputs fall into 2 buckets');
    expect(lesson.tryThis[2]).toContain('from 14 bytes to 5 in 15 tries');
  });

  it('try-this 4: checks on, 1,612 crashes and the typed input crashes; checks off, 0 crashes, 2,021 over-reads, and the typed input is rejected after 9 reads past the end', () => {
    const o = initialOracle();
    const probe = parseHexBytes(o.hex);
    if (!probe.ok) throw new Error('default probe must parse');
    const on = runFuzz({ kind: 'guided', seed: o.seed, executions: o.executions, target: { magic: 'bytewise', boundsCheck: true } });
    const off = runFuzz({ kind: 'guided', seed: o.seed, executions: o.executions, target: { magic: 'bytewise', boundsCheck: false } });
    expect([on.crashes.length, off.crashes.length, off.overReadRuns]).toEqual([1612, 0, 2021]);
    expect([FACTS.oracleOnCrashes, FACTS.oracleOffCrashes, FACTS.oracleOffOverReads, FACTS.probeOn, FACTS.probeOff, FACTS.probeOffOverReads]).toEqual([1612, 0, 2021, 'crash at b6', 'rejected (checksum)', 9]);
    expect(runTarget(probe.value, { magic: 'bytewise', boundsCheck: true }).outcome).toEqual({ kind: 'crash', site: 6 });
    const unchecked = runTarget(probe.value, { magic: 'bytewise', boundsCheck: false });
    expect([unchecked.outcome, unchecked.overReads]).toEqual([{ kind: 'rejected', reason: 'checksum' }, 9]);
    expect(expectCaption(probeCaption(unchecked, false))).toContain('9 reads went past the end unnoticed');
    expect(expectCaption(oracleCaption(false, off))).toContain('0 executions crashed, yet 2,021 still read past the end');
  });
});

describe('captions across the control cross product', () => {
  it('race captions are clean and true for both magic modes, three seeds and the slider extremes', () => {
    for (const magic of ['bytewise', 'single'] as const) {
      for (const seed of [0, 3, 13]) {
        for (const executions of [MIN_EXECUTIONS, 5000, MAX_EXECUTIONS]) {
          const target = { magic, boundsCheck: true };
          const guided = runFuzz({ kind: 'guided', seed, executions, target });
          const blind = runFuzz({ kind: 'blind', seed, executions, target });
          const text = expectCaption(raceCaption(blind, guided, totalEdges(magic), magic));
          expect(text).not.toMatch(CLEAN);
          expect(text).toContain(`guided covers ${guided.edges.size} of ${totalEdges(magic)} edges`);
          expect(text).toContain(guided.firstCrashAt === null ? 'no crash yet' : `first crash at execution ${guided.firstCrashAt.toLocaleString('en-US')}`);
          expect(guided.edges.size).toBeLessThanOrEqual(totalEdges(magic));
          if (magic === 'single') expect(text).toContain('One 4-byte comparison gives no partial progress');
        }
      }
    }
  });

  it('crash, corpus and oracle captions are clean for seeds with and without a crash', () => {
    for (const seed of [0, 3, 13, 17]) {
      for (const executions of [MIN_EXECUTIONS, 20_000]) {
        const run = runFuzz({ kind: 'guided', seed, executions, target: BYTEWISE });
        const buckets = bucketCrashes(run.crashes);
        if (buckets.length === 0) expect(expectCaption(noCrashCaption(run))).toContain(`no crash in ${executions.toLocaleString('en-US')} executions`);
        for (const b of buckets) {
          const largest = largestCrash(run.crashes, b.site)!;
          const min = minimise(largest.bytes, (x) => crashesAt(x, b.site, BYTEWISE));
          for (const f of minimiseFrames(run, largest.bytes, min, b.site)) expect(expectCaption(f.say)).not.toMatch(CLEAN);
          expect(expectCaption(crashStartCaption(run, b.site, largest.bytes.length))).toContain(`${b.site}`);
          expect(expectCaption(minimiseDoneCaption(largest.bytes.length, min, b.site))).toContain(`${min.result.length} byte`);
        }
        for (const entry of run.corpus) expect(expectCaption(corpusCaption(entry, run.corpus.length))).not.toMatch(CLEAN);
        for (const boundsCheck of [true, false]) {
          const checked = runFuzz({ kind: 'guided', seed, executions, target: { magic: 'bytewise', boundsCheck } });
          expect(expectCaption(oracleCaption(boundsCheck, checked))).not.toMatch(CLEAN);
          if (boundsCheck) expect(checked.crashes.length).toBe(checked.overReadRuns);
          else expect(checked.crashes.length).toBe(0);
        }
        expect(logRowsOf(run).every((r) => r.id !== undefined)).toBe(true);
      }
    }
  });

  it('minimiser captions say kept or put back from the step the minimiser took', () => {
    expect(expectCaption(minimiseStepCaption(2, 4, true, 10, 6))).toBe('Drop bytes 2 to 3 of 10: the rest still crashes at b6, so they stay dropped.');
    expect(expectCaption(minimiseStepCaption(5, 6, false, 10, 8))).toBe('Drop byte 5 of 10: the crash at b8 goes away, so they are needed and go back.');
  });
});

describe('the lesson stays inside the simulation', () => {
  it('has no network call and no eval in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    expect(forbiddenCalls(sources)).toEqual([]);
  });

  it('chips every scene as simulated and a toy', () => {
    for (const file of ['./RaceScene.tsx', './CorpusScene.tsx', './CrashScene.tsx', './OracleScene.tsx']) {
      expect(sources[file]).toContain('<Provenance kind="simulated"');
      expect(sources[file]).toContain('<Provenance kind="toy">');
    }
  });

  it('never reaches for a real RegExp or a code constructor on typed text', () => {
    for (const [file, text] of Object.entries(sources)) expect(text, file).not.toMatch(/new RegExp|new Function|\beval\(/);
  });
});

import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { accessCaption, memoryNote, n, sharingCaption } from './captions';
import { COUNTEREXAMPLE } from './counterexample';
import { brokenFacts, mesiFacts, sharingFacts } from './facts';
import lesson from './index';
import { allOps, freshMachine, step } from './mesi';
import { LOG_LIMIT, mesiOpening, press, replayCounterexample, withProtocol } from './session';
import {
  BURST_RANGE, LAYOUTS, WRITES_RANGE, counterSlots, placement, runSharing, sharingOpening, type SharingConfig,
} from './sharing';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

describe('scene switches', () => {
  it('every scene is its own component and carries its own key, so no scene opens on another scene\'s state', () => {
    expect(sceneElements('cache-coherence')).toHaveLength(2);
    expect(sharedSceneComponents('cache-coherence')).toEqual([]);
    expect(sceneElements('cache-coherence').every((e) => e.keyed)).toBe(true);
  });

  it('each scene\'s opening state is the one its try-this assumes', () => {
    const s = mesiOpening();
    expect(s.protocol).toBe('mesi');
    expect(s.last).toBeNull();
    expect(s.machine).toEqual(freshMachine());
    expect(s.machine.caches.map((c) => c.state).join('')).toBe('IIII');
    expect(sharingOpening()).toEqual({ layout: 'adjacent', lineBytes: 64, offsetA: 0, offsetB: 8, burst: 1, writes: 64 });
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: read 0, write 0, read 1 goes E, M (silent), then S and S with memory written back', () => {
    const f = mesiFacts();
    expect(f.map((x) => x.states)).toEqual(['EIII', 'MIII', 'SSII']);
    expect(f.map((x) => x.bus)).toEqual([1, 1, 2]);
    expect(f[2].memory).toBe(1);
    expect(lesson.tryThis[0]).toContain('EIII, MIII, SSII');
    expect(lesson.tryThis[0]).toContain('(still 1 transaction)');
  });

  it('try-this 2: with invalidation off core 0 reads 0 against a latest write of 1; with it on core 0 reads 1', () => {
    const f = brokenFacts();
    expect(f.broken).toMatchObject({ read: 0, latest: 1, stale: true, core0: 'E' });
    expect(f.correct).toMatchObject({ read: 1, latest: 1, stale: false, core0: 'S' });
    expect(lesson.tryThis[1]).toContain('core 0 reads 0 while the latest write is 1');
    expect(lesson.tryThis[1]).toContain('returns 1');
  });

  it('try-this 3: 64 transfers and 6,400 cycles adjacent, 2 and 262 padded, 64 for the atomic counter', () => {
    const f = sharingFacts();
    expect(f.adjacent).toEqual({ transfers: 64, cost: 6400, hits: 0 });
    expect(f.padded).toEqual({ transfers: 2, cost: 2 * 100 + 62 });
    expect(f.atomic.transfers).toBe(64);
    expect(lesson.tryThis[2]).toContain('64 ownership transfers and a cost of 6,400');
    expect(lesson.tryThis[2]).toContain('2 transfers and 262');
  });

  it('try-this 4: counter B at byte 64 gives 2 transfers on 64-byte lines and 64 on 128-byte lines', () => {
    const f = sharingFacts();
    expect([f.apart.transfers, f.apartWide.transfers]).toEqual([2, 64]);
    expect(lesson.tryThis[3]).toContain('fall to 2');
    expect(lesson.tryThis[3]).toContain('return to 64');
  });

  it('try-this 5: a burst of 8 gives 8 transfers and a cost of 856 against 64 and 6,400', () => {
    const f = sharingFacts();
    expect(f.burst8).toEqual({ transfers: 8, cost: 8 * 100 + 56 });
    expect(lesson.tryThis[4]).toContain('from 64 to 8');
    expect(lesson.tryThis[4]).toContain('from 6,400 to 856');
  });
});

describe('captions say what the model did', () => {
  it('every access from the opening state and from a warmed state, under both protocols, names its bus transaction and the running count', () => {
    for (const protocol of ['mesi', 'no-invalidate'] as const) {
      for (const warm of [null, ...allOps()]) {
        const base = warm ? press(withProtocol(protocol), warm) : withProtocol(protocol);
        for (const op of allOps()) {
          const after = press(base, op);
          const say = text(accessCaption(after.last!));
          expect(say).toContain(`Bus transactions so far: ${after.machine.busCount}.`);
          expect(say.includes('stale')).toBe(after.last!.stale);
          expect(say).toContain(`Core ${op.core} ${op.access === 'read' ? 'read' : 'wrote'}`);
          if (after.last!.bus === null) expect(say).toContain('no bus traffic');
        }
      }
    }
  });

  it('the memory note says stale exactly when memory differs from the latest write', () => {
    let s = mesiOpening();
    expect(memoryNote(s.machine)).toBe('up to date');
    s = press(s, { core: 0, access: 'write' });
    expect(memoryNote(s.machine)).toBe('stale: the latest write is 1');
    s = press(s, { core: 1, access: 'read' });
    expect(memoryNote(s.machine)).toBe('up to date');
  });

  it('the log keeps the last 8 accesses, a protocol switch starts over, and the replay ends on the stale read', () => {
    let s = mesiOpening();
    for (let i = 0; i < 12; i++) s = press(s, { core: i % 4, access: i % 3 === 0 ? 'write' : 'read' });
    expect(s.log).toHaveLength(LOG_LIMIT);
    expect(withProtocol('no-invalidate')).toMatchObject({ protocol: 'no-invalidate', last: null, log: [] });
    const replay = replayCounterexample();
    expect(replay.protocol).toBe('no-invalidate');
    expect(replay.last?.stale).toBe(true);
    expect(replay.log).toHaveLength(COUNTEREXAMPLE.length);
  });

  it('the false-sharing caption quotes the same transfers, hits and cost as the run, across layouts, line sizes, bursts and offsets', () => {
    const base = sharingOpening();
    for (const layout of LAYOUTS) {
      for (const lineBytes of [64, 128] as const) {
        for (const burst of [BURST_RANGE.min, BURST_RANGE.max]) {
          for (const [offsetA, offsetB] of [[0, 8], [0, 64], [16, 16]]) {
            for (const writes of [WRITES_RANGE.min, WRITES_RANGE.max]) {
              const cfg: SharingConfig = { ...base, layout, lineBytes, burst, offsetA, offsetB, writes };
              const run = runSharing(cfg);
              const say = text(sharingCaption(cfg, run));
              expect(say).toContain(`${n(run.transfers)} ownership transfer`);
              expect(say).toContain(`Cost ${n(run.cost)} cycles`);
              expect(run.hits + run.transfers).toBe(writes);
              const { lines } = placement(cfg);
              if (say.includes('yet they share a line')) expect(lines[0]).toBe(lines[1]);
              if (say.includes('different lines')) expect(lines[0]).not.toBe(lines[1]);
              expect(say.includes('one counter, not two')).toBe(layout === 'adjacent' && offsetA === offsetB);
              if (layout === 'adjacent') {
                // independent oracle: byte offset / line size is the line number
                const apart = Math.floor(offsetA / lineBytes) !== Math.floor(offsetB / lineBytes);
                expect(say.includes('separate')).toBe(apart);
                expect(say.includes(`in one ${lineBytes}-byte line`)).toBe(!apart);
              }
            }
          }
        }
      }
    }
  });

  it('a cache that only supplied the line is not reported as a state change', () => {
    let m = freshMachine();
    m = step(m, { core: 0, access: 'read' }).machine;
    m = step(m, { core: 1, access: 'read' }).machine;
    const r = step(m, { core: 2, access: 'read' });
    expect(r.reactions.some((x) => x.supplied && x.from === x.to)).toBe(true);
    const say = accessCaption(r);
    expect(say).toContain('supplied the line');
    expect(say).not.toMatch(/core 0 (S|E) to /);
  });

  it('the counters are drawn where the model puts them', () => {
    const base = sharingOpening();
    expect(counterSlots(base)).toEqual([{ thread: 0, line: 0, slot: 0 }, { thread: 1, line: 0, slot: 1 }]);
    expect(counterSlots({ ...base, offsetB: 64 })).toEqual([{ thread: 0, line: 0, slot: 0 }, { thread: 1, line: 1, slot: 0 }]);
    expect(counterSlots({ ...base, offsetB: 64, lineBytes: 128 })).toEqual([{ thread: 0, line: 0, slot: 0 }, { thread: 1, line: 0, slot: 8 }]);
    expect(counterSlots({ ...base, layout: 'atomic' }).every((s) => s.line === 0 && s.slot === 0)).toBe(true);
    expect(counterSlots({ ...base, layout: 'padded' }).map((s) => s.line)).toEqual([0, 1]);
  });
});

describe('honesty and quiz', () => {
  it('no model file reads a clock, starts a timer or touches the network', () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts') && !name.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(5);
    for (const [name, source] of files) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
      expect(code, name).not.toMatch(/performance\.now|Date\.now|new Date|setTimeout|setInterval|requestAnimationFrame|fetch\(/);
    }
  });

  it('the correct quiz option is the strictly longest in at most half the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(lesson.quiz.length / 2);
  });

  it('the quiz numbers come from the model', () => {
    const s = sharingFacts();
    expect(lesson.quiz[0].why).toContain(`${s.writes} alternating writes cause ${s.adjacent.transfers} ownership transfers`);
    expect(lesson.quiz[4].options[0]).toContain(`${s.burst8.transfers} transfers instead of ${s.adjacent.transfers}`);
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toBe('Invalid');
  });
});

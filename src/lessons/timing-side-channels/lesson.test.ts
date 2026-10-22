import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { runNode } from '../../core/testing/node';
import { forbiddenCalls, NO_CLOCK_OR_TIMER } from '../../core/testing/forbidden';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { byteStepCaption, compareSummary, lengthMismatchCaption, mitigationCaption, n, noiseCaption, verdictCaption } from './captions';
import { COMPARE_FNS, DEFAULT_GUESS, SECRET_BYTES, compareOpening, matchedPrefix, parseGuess } from './compare';
import { compareFacts, mitigationFacts, noiseFacts, traceFacts } from './facts';
import { compareFrames } from './frames';
import lesson from './index';
import { MITIGATIONS, openClasses, type MitigationId } from './mitigations';
import { NOISE_RANGE, SIGNAL_RANGE, noiseOpening, samplesNeeded } from './noise';
import { PAIR_PRESETS, PROGRAMS, programOf, secretBytes, tracesOpening, verdict } from './traces';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
const lessonFiles = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));

describe('scene switches', () => {
  it('every scene is its own component and carries its own key, so no scene opens on another scene\'s state', () => {
    expect(sceneElements('timing-side-channels')).toHaveLength(4);
    expect(sharedSceneComponents('timing-side-channels')).toEqual([]);
    expect(sceneElements('timing-side-channels').every((e) => e.keyed)).toBe(true);
  });

  it('each scene\'s opening state is the one its try-this assumes', () => {
    expect(compareOpening()).toEqual({ text: 'demo-tok-AAAAAAA', fn: 'early' });
    expect(matchedPrefix(SECRET_BYTES, parseGuess(DEFAULT_GUESS).ok ? [...new TextEncoder().encode(DEFAULT_GUESS)] : [])).toBe(9);
    expect(noiseOpening()).toEqual({ perComparison: 10, sigma: 40 });
    expect(tracesOpening()).toEqual({ program: 'secret-if', a: 0x13219c03, b: 0xc4219c03 });
    expect(openClasses([])).toHaveLength(5);
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: early exit executes 10 comparisons at the opening guess, 1 for all wrong, 16 for all right; constant time executes 16 each time', () => {
    const f = compareFacts();
    expect(f.opening).toEqual({ early: 10, constant: 16 });
    expect(f.allWrong).toEqual({ early: 1, constant: 16 });
    expect(f.fourRight).toEqual({ early: 5, constant: 16 });
    expect(f.allRight).toEqual({ early: 16, constant: 16 });
    expect(lesson.tryThis[0]).toContain('matching the first 9 bytes');
    expect(lesson.tryThis[0]).toContain('executes 10 comparisons and constant time 16');
    expect(lesson.tryThis[0]).toContain('drops to 1 while constant time stays at 16');
  });

  it('try-this 2: the 8-byte guess stops both functions at the length check with 0 comparisons', () => {
    const f = compareFacts();
    expect([f.wrongLengthBytes, f.tokenBytes, f.wrongLength.early, f.wrongLength.constant]).toEqual([8, 16, 0, 0]);
    expect(lesson.tryThis[1]).toContain('8 bytes against the token\'s 16');
    expect(lesson.tryThis[1]).toContain('0 byte comparisons');
  });

  it('try-this 3: 251 observations at noise 40, 1,568 at noise 100, 392 once the signal is 20', () => {
    const f = noiseFacts();
    expect([f.opening, f.tenTimes, f.strongerSignal]).toEqual([251, 1568, 392]);
    // hand-worked: 2 x 7.84 x sigma^2 / delta^2
    expect(Math.ceil((2 * 2.8 ** 2 * 100 ** 2) / 20 ** 2)).toBe(392);
    expect(lesson.tryThis[2]).toContain('about 251 observations');
    expect(lesson.tryThis[2]).toContain('ten times the signal: 1,568');
    expect(lesson.tryThis[2]).toContain('signal to 20: 392');
  });

  it('try-this 4: the if leaks on the far pair at event 1, not on the near pair; the broken compare leaks on the zero pair and the constant-time compare does not', () => {
    const f = traceFacts();
    expect(f).toMatchObject({ openingLeaks: true, openingFirstDifference: 1, nearIf: false, zeroBroken: true, zeroConstant: false });
    expect(lesson.tryThis[3]).toContain('differing at event 1');
  });

  it('try-this 5: constant-time code covers its class and leaves 4 of 5 open; all six leave none open but only two covered', () => {
    const f = mitigationFacts();
    expect(f).toMatchObject({ classes: 5, afterConstantTime: 4, constantTimeCovers: 'covered', afterAll: 0, afterAllCovered: 2, afterAllPartly: 3, mitigations: 6 });
    expect(lesson.tryThis[4]).toContain('its class is covered and 4 of 5 classes are still open');
    expect(lesson.tryThis[4]).toContain('Switch on all 6: 2 classes covered, 3 only partly and 0 open');
  });

  it('switching all six on never reads as everything covered', () => {
    const say = text(mitigationCaption(MITIGATIONS.map((m) => m.id)));
    expect(say).toContain('2 of 5 classes covered, 3 partly, 0 open');
    expect(say).not.toContain('5 of 5 classes covered');
  });
});

describe('captions say what the model did', () => {
  it('every guess prefix and length: the step captions, summary and frames name the instrument\'s counts', () => {
    for (let prefix = 0; prefix <= 16; prefix++) {
      const guess = SECRET_BYTES.map((b, i) => (i < prefix ? b : (b + 1) % 256));
      const early = COMPARE_FNS.early(SECRET_BYTES, guess);
      const constant = COMPARE_FNS.constant(SECRET_BYTES, guess);
      const summary = text(compareSummary(SECRET_BYTES, guess, early, constant));
      expect(summary).toContain(`Early exit executed ${n(early.comparisons)} comparison`);
      expect(summary).toContain(`constant time executed ${n(constant.comparisons)} comparison`);
      for (const fn of ['early', 'constant'] as const) {
        const frames = compareFrames(fn, guess);
        const result = COMPARE_FNS[fn](SECRET_BYTES, guess);
        expect(frames).toHaveLength(result.visited.length + 2);
        frames.forEach((f) => text(f.say));
        result.visited.forEach((_, k) => text(byteStepCaption(fn, k, SECRET_BYTES, guess, result)));
        expect(frames[frames.length - 1].shown).toBe(result.visited.length);
      }
    }
    for (const length of [0, 8, 15, 17 - 1 - 1]) {
      const guess = Array.from({ length }, () => 65);
      expect(text(compareSummary(SECRET_BYTES, guess, COMPARE_FNS.early(SECRET_BYTES, guess), COMPARE_FNS.constant(SECRET_BYTES, guess)))).toBe(text(lengthMismatchCaption(length, 16)));
      expect(compareFrames('early', guess)).toHaveLength(1);
    }
  });

  it('the early-exit caption says "never visited" only when a byte really was skipped', () => {
    for (let prefix = 0; prefix <= 15; prefix++) {
      const guess = SECRET_BYTES.map((b, i) => (i < prefix ? b : (b + 1) % 256));
      const early = COMPARE_FNS.early(SECRET_BYTES, guess);
      const last = text(byteStepCaption('early', early.visited.length - 1, SECRET_BYTES, guess, early));
      expect(last.includes('never visited')).toBe(early.visited.length < 16);
    }
  });

  it('the noise caption quotes the same samples-needed as the stat, at the slider extremes', () => {
    for (const perComparison of [SIGNAL_RANGE.min, SIGNAL_RANGE.default, SIGNAL_RANGE.max]) {
      for (const sigma of [NOISE_RANGE.min, NOISE_RANGE.default, NOISE_RANGE.max]) {
        const s = { perComparison, sigma };
        const say = text(noiseCaption(s));
        expect(say).toContain(`About ${n(samplesNeeded(s))} repeated observation${samplesNeeded(s) === 1 ? '' : 's'}`);
        expect(say).toContain(`halve the noise and it is ${n(samplesNeeded({ ...s, sigma: Math.max(1, sigma / 2) }))}`);
      }
    }
  });

  it('the verdict caption says "leaks" exactly when the traces differ, for every program and every preset pair', () => {
    for (const pair of PAIR_PRESETS) {
      for (const program of PROGRAMS) {
        const v = verdict(program, secretBytes(pair.a), secretBytes(pair.b));
        const say = text(verdictCaption(v, program.label));
        expect(say.includes('it leaks')).toBe(v.leaks);
        expect(say.includes('identical')).toBe(!v.leaks);
        expect(programOf(program.id)).toBe(program);
      }
    }
  });

  it('the mitigation caption counts the table: covered, partly and open add up to the classes, over all 64 combinations', () => {
    const ids = MITIGATIONS.map((m) => m.id);
    for (let mask = 0; mask < 2 ** ids.length; mask++) {
      const enabled: MitigationId[] = ids.filter((_, i) => mask & (1 << i));
      const say = text(mitigationCaption(enabled));
      const m = say.match(/(\d+) of 5 classes covered, (\d+) partly, (\d+) open/)!;
      expect(Number(m[1]) + Number(m[2]) + Number(m[3])).toBe(5);
      expect(Number(m[3])).toBe(openClasses(enabled).length);
    }
  });
});

describe('payload-free and clock-free', () => {
  it('no file reads a clock, starts a timer, touches the network or evaluates text', () => {
    expect(lessonFiles.length).toBeGreaterThan(10);
    expect(forbiddenCalls(Object.fromEntries(lessonFiles), { also: NO_CLOCK_OR_TIMER, ignoreComments: true })).toEqual([]);
  });

  it('the token is assembled from parts, so no source line holds it whole', () => {
    for (const [name, source] of lessonFiles) expect(source, name).not.toContain('demo-tok-7Hq2zX9');
  });

  it('Node\'s crypto.timingSafeEqual throws on buffers of different length, as the lesson says (checked against the real Node)', () => {
    const run = runNode([
      "const c = require('node:crypto');",
      "let threw = false; try { c.timingSafeEqual(Buffer.from('ab'), Buffer.from('abc')); } catch (e) { threw = e instanceof RangeError; }",
      "console.log(JSON.stringify({ threw, same: c.timingSafeEqual(Buffer.from('abc'), Buffer.from('abc')), diff: c.timingSafeEqual(Buffer.from('abc'), Buffer.from('abd')) }));",
    ]);
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout.trim())).toEqual({ threw: true, same: true, diff: false });
  });
});

describe('quiz', () => {
  it('the correct option is the strictly longest in at most half the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(lesson.quiz.length / 2);
  });

  it('the quiz numbers come from the model', () => {
    const f = noiseFacts();
    expect(lesson.quiz[0].why).toContain(`${n(f.tenTimes)} per case at ten times the signal, against ${n(f.opening)} at four times`);
    expect(traceFacts().farLeakCount).toBe(2);
    expect(lesson.quiz[1].why).toContain('On the far pair alone, 2 of 5 programs leak');
    expect(lesson.quiz[2].why).toContain('16 comparisons for a guess that is entirely wrong');
  });
});

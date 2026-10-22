import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { kanonCaption, logsCaption, noiseCaption, recordsCaption } from './captions';
import { MAX_DAY, STRATEGY_ORDER, stateOf } from './copies';
import { FACTS } from './facts';
import lesson from './index';
import { AGE_LEVELS, ZIP_LEVELS, makePublicList, makeTable, viewOf } from './kanon';
import { CANDIDATE_EMAILS, FIELD_ORDER, TREATMENT_ORDER, recover, treat, type FieldId, type Treatment } from './logline';
import { BUDGET, MAX_EPSILON, MIN_EPSILON, NOISE_SEED, answersFor, ask, mean } from './noise';
import { SUPPRESS_RANGE, initialKanon, initialLogs, initialNoise, initialRecords } from './opening';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CLEAN = /NaN|undefined|\[object|null/;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('privacy-engineering');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('privacy-engineering')).toEqual([]);
  });

  it('each scene opens on its own fresh state, and editing one copy does not change the next', () => {
    const n = initialNoise();
    n.asked.push(1);
    expect(initialNoise().asked).toEqual([]);
    const l = initialLogs();
    l.choice.email = 'drop';
    expect(initialLogs().choice.email).toBe('keep');
    expect(initialRecords()).toEqual({ strategy: 'primary', day: 0, legalHold: false, minimise: false });
    expect(initialKanon()).toEqual({ zip: 5, age: 'exact', suppressBelow: 1 });
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: 7 of 8 copies readable at day 0; 2 at day 90 (search index, ML training set); the queue is done on day 35; shredding leaves 4 unreadable and 4 readable', () => {
    expect([FACTS.primaryDay0Readable, FACTS.primaryDay90Readable, FACTS.primaryDay90Names]).toEqual([7, 2, ['search index', 'ml training set']]);
    expect([FACTS.queueDoneDay, FACTS.queueBeforeDone, FACTS.shredUnreadable, FACTS.shredReadable]).toEqual([35, 1, 4, 4]);
    expect(expectCaption(recordsCaption(initialRecords()))).toContain('7 of 8 copies still hold readable data');
    expect(lesson.tryThis[0]).toContain('1 copy remains on day 34 and none on day 35');
  });

  it('try-this 2: k 1, 48 unique, 46 linked; then 3 digits and a 25-year range give k 4, l 1, 0 unique, 0 linked at 75% loss, with one leaking group', () => {
    expect([FACTS.openingK, FACTS.openingUnique, FACTS.openingLinked]).toEqual([1, 48, 46]);
    expect([FACTS.generalisedK, FACTS.generalisedL, FACTS.generalisedUnique, FACTS.generalisedLinked, FACTS.generalisedLoss]).toEqual([4, 1, 0, 0, 75]);
    const table = makeTable();
    const v = viewOf(table, makePublicList(table), { zip: 3, age: 'range' }, 1);
    expect(expectCaption(kanonCaption(v))).toContain(`k = 4, l = 1`);
    expect(expectCaption(kanonCaption(v))).toContain(`has ${FACTS.leakSize} people who all have condition ${FACTS.leakCondition}`);
    expect(lesson.tryThis[1]).toContain('information loss of 75%');
  });

  it('try-this 3: ten answers at epsilon 1 spend the budget; a hundred at 0.1 spend it too and average closer to 37', () => {
    expect([FACTS.tenAnswers, FACTS.tenSpent, FACTS.hundredAnswers]).toEqual([10, 10, 100]);
    expect([FACTS.tenScale, FACTS.hundredScale]).toEqual(['1.0', '10.0']);
    const ten = answersFor(NOISE_SEED, ask([], 1, 10).map((epsilon) => ({ epsilon })));
    const hundred = answersFor(NOISE_SEED, ask([], 0.1, 100).map((epsilon) => ({ epsilon })));
    expect([ten.exhausted, hundred.exhausted]).toEqual([false, false]);
    expect(Math.abs(mean(ten.values) - 37)).toBeLessThan(2);
    expect(Math.abs(mean(hundred.values) - 37)).toBeLessThan(5);
    expect(expectCaption(noiseCaption(1, ten))).toContain(`their mean is ${FACTS.tenMean}`);
    expect(lesson.tryThis[2]).toContain(`mean ${FACTS.hundredMean}`);
  });

  it('try-this 4: 3 of 3 personal fields identify; a hashed email recovers mara@example.test; the keyed hash does not', async () => {
    expect([FACTS.openingIdentifying, FACTS.personalFields]).toEqual([3, 3]);
    const logged = (await treat('email', 'mara@example.test', 'hash'))!;
    expect((await recover(logged, CANDIDATE_EMAILS)).recovered).toBe('mara@example.test');
    const keyed = (await treat('email', 'mara@example.test', 'hmac'))!;
    expect((await recover(keyed, CANDIDATE_EMAILS)).recovered).toBeNull();
    expect(lesson.tryThis[3]).toContain('recovers mara@example.test');
  });
});

describe('captions across the control cross product', () => {
  it('records: every strategy, day extreme and toggle is clean and counts what the model counts', () => {
    for (const strategy of STRATEGY_ORDER) {
      for (const day of [0, 1, 7, 34, 35, MAX_DAY]) {
        for (const legalHold of [false, true]) {
          for (const minimise of [false, true]) {
            const s = { strategy, day, legalHold, minimise };
            const text = expectCaption(recordsCaption(s));
            expect(text).not.toMatch(CLEAN);
            const states = stateOf(s);
            const readable = states.filter((x) => x.status === 'readable').length;
            expect(text).toContain(`${readable} of ${states.filter((x) => x.status !== 'absent').length} copies still hold readable data`);
          }
        }
      }
    }
  });

  it('kanon: every generalisation and threshold is clean and states k and l from the same function', () => {
    const table = makeTable();
    const list = makePublicList(table);
    for (const zip of ZIP_LEVELS) {
      for (const age of AGE_LEVELS) {
        for (let below = SUPPRESS_RANGE.min; below <= SUPPRESS_RANGE.max; below++) {
          const v = viewOf(table, list, { zip, age }, below);
          const text = expectCaption(kanonCaption(v));
          expect(text).not.toMatch(CLEAN);
          if (v.readouts.k !== null) expect(text).toContain(`k = ${v.readouts.k}, l = ${v.readouts.l}`);
          else expect(text).toContain('Every row is suppressed');
        }
      }
    }
  });

  it('noise: the slider extremes, an empty run and an exhausted budget are clean', () => {
    for (const epsilon of [MIN_EPSILON, 1, MAX_EPSILON]) {
      for (const n of [0, 1, 10, 100]) {
        const a = answersFor(NOISE_SEED, ask([], epsilon, n).map((e) => ({ epsilon: e })));
        const text = expectCaption(noiseCaption(epsilon, a));
        expect(text).not.toMatch(CLEAN);
        expect(text.includes('budget is spent')).toBe(a.exhausted);
      }
    }
    const spent = answersFor(NOISE_SEED, ask([], 1, 20).map((epsilon) => ({ epsilon })));
    expect(spent.spent).toBe(BUDGET);
    const refused = answersFor(NOISE_SEED, [...ask([], 1, 10), 1].map((epsilon) => ({ epsilon })));
    expect(refused.exhausted).toBe(true);
    expect(expectCaption(noiseCaption(1, refused))).toContain('budget is spent');
  });

  it('logs: every treatment of the email and of the session is clean, and recovery only claims a match when there is one', async () => {
    for (const email of TREATMENT_ORDER) {
      for (const session of TREATMENT_ORDER) {
        const choice = Object.fromEntries(FIELD_ORDER.map((f: FieldId) => [f, 'keep'])) as Record<FieldId, Treatment>;
        choice.email = email;
        choice.session = session;
        const logged = await treat('email', 'mara@example.test', email);
        const recovery = logged !== null && (email === 'hash' || email === 'hmac') ? await recover(logged, CANDIDATE_EMAILS) : null;
        const text = expectCaption(logsCaption(choice, recovery));
        expect(text).not.toMatch(CLEAN);
        expect(text.includes('reproduces it: it was mara@example.test')).toBe(email === 'hash');
      }
    }
  });
});

describe('the lesson stays inside the simulation', () => {
  it('has no network call and no eval in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(forbiddenCalls(sources)).toEqual([]);
  });

  it('chips every scene as simulated, and the law and the Sweeney figure as from memory', () => {
    for (const file of ['./RecordsScene.tsx', './KanonScene.tsx', './NoiseScene.tsx', './LogsScene.tsx']) expect(sources[file]).toContain('<Provenance kind="simulated"');
    expect(sources['./RecordsScene.tsx']).toContain('not legal advice');
    expect(sources['./KanonScene.tsx']).toContain('Sweeney, 2000');
    expect(sources['./LogsScene.tsx']).toContain('<Provenance kind="real">');
  });

  it('builds its one key from parts and names no real person, address or domain beyond example.test and the documentation ranges', () => {
    expect(sources['./logline.ts']).toContain("fakeSecret('demo-'");
    for (const [file, text] of Object.entries(sources)) {
      const hosts = [...text.matchAll(/@([a-z0-9.-]+\.[a-z]{2,})/g)].map((m) => m[1]);
      expect(hosts.filter((h) => h !== 'example.test'), file).toEqual([]);
      const ips = [...text.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g)].map((m) => m[1]);
      expect(ips.filter((ip) => !ip.startsWith('192.0.2.')), file).toEqual([]);
    }
  });
});

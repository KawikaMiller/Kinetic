import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { nodeDigest, nodeHmac } from '../../core/testing/nodeCrypto';
import { COPIES, MAX_DAY, countStatus, stateOf, type CopyId, type Scenario, type Strategy } from './copies';
import {
  AGE_LEVELS, TABLE_SIZE, ZIP_LEVELS, groupsOf, infoLoss, keyOf, linkedRows, makePublicList, makeTable, readouts, suppressedBelow, viewOf, type Generalisation, type Person,
} from './kanon';
import { CANDIDATE_EMAILS, EXPOSURE_TEXT, FIELDS, FIELD_ORDER, TREATMENT_ORDER, exposure, hashOf, hmacOf, mask, recover, stillIdentifying, treat } from './logline';
import { BUDGET, MAX_ANSWERS, MAX_EPSILON, MIN_EPSILON, TRUE_COUNT, answerAt, answersFor, ask, histogram, laplace, mean, noiseScale } from './noise';

const BASE: Scenario = { strategy: 'primary', day: 0, legalHold: false, minimise: false };
const readableIds = (s: Partial<Scenario>): CopyId[] =>
  stateOf({ ...BASE, ...s }).filter((x) => x.status === 'readable').map((x) => x.copy.id).sort();
const ids = (...x: CopyId[]) => [...x].sort();

describe('deletion across the copies: a hand-built table for the default scenario', () => {
  const ALL: CopyId[] = ['primary', 'search', 'cache', 'logs', 'analytics', 'backups', 'processor', 'training'];

  it('delete from the primary only: each copy goes when its own retention ends, and two never do', () => {
    expect(readableIds({ day: 0 })).toEqual(ids(...ALL.filter((c) => c !== 'primary')));
    expect(readableIds({ day: 1 })).toEqual(ids('search', 'logs', 'analytics', 'backups', 'processor', 'training'));
    expect(readableIds({ day: 30 })).toEqual(ids('search', 'analytics', 'backups', 'processor', 'training'));
    expect(readableIds({ day: 35 })).toEqual(ids('search', 'analytics', 'processor', 'training'));
    expect(readableIds({ day: 60 })).toEqual(ids('search', 'analytics', 'training'));
    expect(readableIds({ day: 90 })).toEqual(ids('search', 'training'));
  });

  it('fan-out queue: each wired copy goes at its own lag, logs and backups on their retention, all gone on day 35', () => {
    const q = (day: number) => readableIds({ strategy: 'queue', day });
    expect(q(0)).toEqual(ids('search', 'logs', 'analytics', 'backups', 'processor', 'training'));
    expect(q(1)).toEqual(ids('logs', 'analytics', 'backups', 'processor', 'training'));
    expect(q(7)).toEqual(ids('logs', 'backups', 'processor', 'training'));
    expect(q(14)).toEqual(ids('logs', 'backups', 'training'));
    expect(q(30)).toEqual(ids('backups'));
    expect(q(34)).toEqual(ids('backups'));
    expect(q(35)).toEqual([]);
  });

  it('crypto-shredding: keyed copies are unreadable at once; the unkeyed ones wait for their retention, and training never goes', () => {
    const shred = (day: number) => stateOf({ ...BASE, strategy: 'shred', day });
    expect(shred(0).filter((x) => x.status === 'unreadable').map((x) => x.copy.id).sort()).toEqual(ids('primary', 'search', 'analytics', 'backups'));
    expect(readableIds({ strategy: 'shred', day: 0 })).toEqual(ids('cache', 'logs', 'processor', 'training'));
    expect(readableIds({ strategy: 'shred', day: 1 })).toEqual(ids('logs', 'processor', 'training'));
    expect(readableIds({ strategy: 'shred', day: 30 })).toEqual(ids('processor', 'training'));
    expect(readableIds({ strategy: 'shred', day: 90 })).toEqual(ids('training'));
  });

  it('retention TTLs: the primary goes at once and every other copy by day 30', () => {
    expect(readableIds({ strategy: 'ttl', day: 0 })).toHaveLength(7);
    expect(readableIds({ strategy: 'ttl', day: 1 })).toHaveLength(6);
    expect(readableIds({ strategy: 'ttl', day: 29 })).toHaveLength(6);
    expect(readableIds({ strategy: 'ttl', day: 30 })).toEqual([]);
  });

  it('a legal hold keeps the primary and the backups, and stops the key being destroyed so keyed copies stay readable', () => {
    const held = stateOf({ ...BASE, strategy: 'queue', day: 90, legalHold: true });
    expect(held.filter((x) => x.status === 'held').map((x) => x.copy.id).sort()).toEqual(ids('primary', 'backups'));
    expect(readableIds({ strategy: 'queue', day: 90, legalHold: true })).toEqual([]);
    const shredHeld = stateOf({ ...BASE, strategy: 'shred', day: 0, legalHold: true });
    expect(shredHeld.filter((x) => x.status === 'unreadable')).toEqual([]);
    expect(readableIds({ strategy: 'shred', day: 0, legalHold: true })).toEqual(ids('search', 'cache', 'logs', 'analytics', 'processor', 'training'));
  });

  it('data minimisation leaves logs and analytics unmade, so there are fewer copies to chase and never more readable ones', () => {
    for (const strategy of ['primary', 'queue', 'shred', 'ttl'] as Strategy[]) {
      for (const day of [0, 1, 7, 30, 35, 90]) {
        const without = stateOf({ ...BASE, strategy, day });
        const withMin = stateOf({ ...BASE, strategy, day, minimise: true });
        expect(countStatus(withMin, 'absent')).toBe(2);
        expect(countStatus(withMin, 'readable')).toBeLessThanOrEqual(countStatus(without, 'readable'));
      }
    }
  });

  it('a copy that is gone stays gone as the days pass, for every strategy and both toggles', () => {
    for (const strategy of ['primary', 'queue', 'shred', 'ttl'] as Strategy[]) {
      for (const legalHold of [false, true]) {
        let previous = new Set(COPIES.map((c) => c.id));
        for (let day = 0; day <= MAX_DAY; day++) {
          const now = new Set(stateOf({ ...BASE, strategy, day, legalHold }).filter((x) => x.status === 'readable').map((x) => x.copy.id));
          for (const id of now) expect(previous.has(id), `${strategy} day ${day} ${id}`).toBe(true);
          previous = now;
        }
      }
    }
  });

  it('unreadable after destroying a key is real: AES-GCM bytes stay in place but only the right key opens them', async () => {
    const subtle = globalThis.crypto.subtle;
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const other = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = new Uint8Array(12);
    const record = new TextEncoder().encode('mara@example.test');
    const bytes = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, record));
    expect(new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes))).toEqual(record);
    await expect(subtle.decrypt({ name: 'AES-GCM', iv }, other, bytes)).rejects.toBeDefined();
    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe('k-anonymity, l-diversity and linkage against brute force', () => {
  /** An independent group-by: the size of the class each kept row falls in, by comparing tuples pairwise. */
  const classSizes = (rows: readonly Person[], g: Generalisation, key: (p: Person, g: Generalisation) => string) => rows.map((a) => rows.filter((b) => key(a, g) === key(b, g)).length);
  const gens: Generalisation[] = ZIP_LEVELS.flatMap((zip) => AGE_LEVELS.map((age) => ({ zip, age })));

  it('k, l and unique-row counts equal a brute-force group-by on 200 seeded tables, at every generalisation', () => {
    for (let seed = 0; seed < 200; seed++) {
      const table = makeTable(seed);
      const none = new Set<number>();
      for (const g of gens) {
        const sizes = classSizes(table, g, keyOf);
        const r = readouts(table, g, none);
        expect(r.k, `seed ${seed}`).toBe(Math.min(...sizes));
        expect(r.unique).toBe(sizes.filter((s) => s === 1).length);
        const distinct = table.map((a) => new Set(table.filter((b) => keyOf(a, g) === keyOf(b, g)).map((b) => b.condition)).size);
        expect(r.l).toBe(Math.min(...distinct));
      }
    }
  });

  it('generalising never lowers k: moving to a coarser level of either field keeps or raises it', () => {
    const order = <T,>(levels: readonly T[], a: T, b: T) => levels.indexOf(b) >= levels.indexOf(a);
    for (let seed = 0; seed < 200; seed++) {
      const table = makeTable(seed);
      for (const a of gens) {
        for (const b of gens) {
          if (order(ZIP_LEVELS, a.zip, b.zip) && order(AGE_LEVELS, a.age, b.age)) {
            expect(readouts(table, b, new Set()).k!).toBeGreaterThanOrEqual(readouts(table, a, new Set()).k!);
          }
        }
      }
    }
  });

  it('suppressing a row never raises another group\'s size', () => {
    for (let seed = 0; seed < 60; seed++) {
      const table = makeTable(seed);
      const g = gens[seed % gens.length];
      const before = new Map(groupsOf(table, g, new Set()).map((x) => [x.key, x.members.length]));
      for (const p of table) {
        for (const x of groupsOf(table, g, new Set([p.id]))) expect(x.members.length).toBeLessThanOrEqual(before.get(x.key)!);
      }
    }
  });

  it('suppressing groups below a threshold leaves every remaining group at the threshold or larger', () => {
    for (let seed = 0; seed < 100; seed++) {
      const table = makeTable(seed);
      for (const g of gens) {
        for (let below = 1; below <= 6; below++) {
          const gone = suppressedBelow(table, g, below);
          for (const x of groupsOf(table, g, gone)) expect(x.members.length).toBeGreaterThanOrEqual(below);
        }
      }
    }
  });

  it('linkage counts equal a brute-force join with the public list', () => {
    for (let seed = 0; seed < 200; seed++) {
      const table = makeTable(seed);
      const list = makePublicList(table, seed);
      for (const g of gens) {
        const brute = table.filter((p) => list.filter((q) => keyOf(q, g) === keyOf(p, g)).length === 1).map((p) => p.id);
        expect(linkedRows(table, list, g, new Set()).map((p) => p.id), `seed ${seed} ${g.zip} ${g.age}`).toEqual(brute);
      }
    }
  });

  it('hand-worked vector at the pinned seed: nothing generalised gives k 1, 48 unique, 46 linked; 3 digits and a 25-year range gives k 4, l 1, 0 unique, 0 linked', () => {
    const table = makeTable();
    const list = makePublicList(table);
    expect(table).toHaveLength(TABLE_SIZE);
    const a = viewOf(table, list, { zip: 5, age: 'exact' }, 1);
    expect([a.readouts.k, a.readouts.unique, a.linkedNow, a.linkedExact]).toEqual([1, 48, 46, 46]);
    const b = viewOf(table, list, { zip: 3, age: 'range' }, 1);
    expect([b.readouts.k, b.readouts.l, b.readouts.unique, b.linkedNow]).toEqual([4, 1, 0, 0]);
    expect(b.leak!.members.length).toBeGreaterThanOrEqual(2);
    expect(new Set(b.leak!.members.map((m) => m.condition)).size).toBe(1);
  });

  it('the information loss is 0 untouched, 1 with everything generalised and suppressed, and rises with each step', () => {
    expect(infoLoss({ zip: 5, age: 'exact' }, 0)).toBe(0);
    expect(infoLoss({ zip: 0, age: 'range' }, 0)).toBe(1);
    expect(infoLoss({ zip: 5, age: 'exact' }, TABLE_SIZE)).toBe(1);
    expect(infoLoss({ zip: 3, age: 'exact' }, 0)).toBeGreaterThan(infoLoss({ zip: 5, age: 'exact' }, 0));
    expect(infoLoss({ zip: 3, age: 'exact' }, 6)).toBeGreaterThan(infoLoss({ zip: 3, age: 'exact' }, 0));
  });
});

describe('the Laplace noise and the budget', () => {
  const SAMPLES = 100_000;

  it('has mean within 0.02 of 0 and mean absolute deviation within 3% of the scale 1/epsilon, for epsilon 0.5, 1 and 2', () => {
    for (const epsilon of [0.5, 1, 2]) {
      const rnd = mulberry32(28);
      const scale = noiseScale(epsilon);
      let sum = 0;
      let abs = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const x = laplace(rnd, scale);
        sum += x;
        abs += Math.abs(x);
      }
      expect(Math.abs(sum / SAMPLES), `epsilon ${epsilon}`).toBeLessThan(0.02 * Math.max(1, scale));
      expect(Math.abs(abs / SAMPLES - scale) / scale, `epsilon ${epsilon}`).toBeLessThan(0.03);
    }
  });

  it('averaging n answers shrinks the error by about the square root of n, measured over 400 seeded runs', () => {
    const trials = 400;
    const spread = (n: number) => {
      let sq = 0;
      for (let t = 0; t < trials; t++) {
        const answers = Array.from({ length: n }, (_, k) => answerAt(1000 + t, k, 0.5));
        sq += (mean(answers) - TRUE_COUNT) ** 2;
      }
      return Math.sqrt(sq / trials);
    };
    const one = spread(1);
    const hundred = spread(100);
    expect(one / hundred).toBeGreaterThan(8);
    expect(one / hundred).toBeLessThan(12.5);
  });

  it('is the same answer for the same seed and question, and different for another seed', () => {
    expect(answerAt(28, 3, 1)).toBe(answerAt(28, 3, 1));
    expect(answerAt(28, 3, 1)).not.toBe(answerAt(29, 3, 1));
  });

  it('each answer spends its epsilon: 10 at epsilon 1 spend the whole budget of 10, the 11th is refused, and 100 at 0.1 also spend exactly 10', () => {
    expect(BUDGET).toBe(10);
    const ten = ask([], 1, 10);
    expect(ten).toHaveLength(10);
    expect(ask(ten, 1, 5)).toHaveLength(10);
    const tenth = ask([], MIN_EPSILON, 200);
    expect(tenth).toHaveLength(100);
    const a = answersFor(28, tenth.map((epsilon) => ({ epsilon })));
    expect(a.spent).toBeCloseTo(10, 9);
    expect(answersFor(28, [...tenth, MIN_EPSILON].map((epsilon) => ({ epsilon }))).exhausted).toBe(true);
    expect(MAX_ANSWERS).toBeGreaterThanOrEqual(100);
  });

  it('the epsilon floor keeps the noise scale finite across the slider, and the histogram keeps every answer', () => {
    for (let e = MIN_EPSILON; e <= MAX_EPSILON + 1e-9; e += 0.1) expect(Number.isFinite(noiseScale(Math.round(e * 10) / 10))).toBe(true);
    const values = Array.from({ length: 500 }, (_, i) => answerAt(5, i, 0.1));
    const bins = histogram(values, TRUE_COUNT - 40, TRUE_COUNT + 40);
    expect(bins.reduce((s, b) => s + b.y, 0)).toBe(500);
  });
});

describe('the log fields and the hashed email', () => {
  it('the plain hash of a candidate equals the logged value for the matching candidate only; the keyed hash is not reproduced by a guess', async () => {
    const real = CANDIDATE_EMAILS[1];
    const logged = (await treat('email', real, 'hash'))!;
    expect(logged).toBe(nodeDigest('sha256', real).slice(0, 12));
    const r = await recover(logged, CANDIDATE_EMAILS);
    expect(r.recovered).toBe(real);
    expect(r.tried.filter((t) => t.match).map((t) => t.candidate)).toEqual([real]);
    const keyed = (await treat('email', real, 'hmac'))!;
    expect(keyed).toBe(nodeHmac('sha256', 'demo-log-hmac-key', real).slice(0, 12));
    expect((await recover(keyed, CANDIDATE_EMAILS)).recovered).toBeNull();
    expect(await hashOf(real)).toBe(nodeDigest('sha256', real));
    expect(await hmacOf(real)).toBe(nodeHmac('sha256', 'demo-log-hmac-key', real));
  });

  it('keeps, masks and drops as the labels say, and masks do not reveal the whole value', async () => {
    expect(await treat('email', 'mara@example.test', 'keep')).toBe('mara@example.test');
    expect(await treat('email', 'mara@example.test', 'drop')).toBeNull();
    expect(mask('email', 'mara@example.test')).toBe('m***@example.test');
    expect(mask('ip', '192.0.2.17')).toBe('192.*.*.*');
  });

  it('exposure follows the treatment for every field, and only dropping or not being personal makes a field safe', () => {
    for (const f of FIELD_ORDER) {
      for (const t of TREATMENT_ORDER) {
        const e = exposure(f, t);
        expect(EXPOSURE_TEXT[e]).toBeTruthy();
        if (!FIELDS[f].pii) expect(e).toBe(t === 'drop' ? 'gone' : 'not-personal');
        else if (t === 'drop') expect(e).toBe('gone');
        else if (t === 'keep') expect(e).toBe('identifies');
      }
    }
    expect(exposure('email', 'hash')).toBe('guessable');
    expect(exposure('session', 'hash')).toBe('linkable');
    expect(exposure('email', 'hmac')).toBe('linkable');
    const all = Object.fromEntries(FIELD_ORDER.map((f) => [f, 'keep'])) as Record<(typeof FIELD_ORDER)[number], 'keep'>;
    expect(stillIdentifying(all)).toEqual(['email', 'ip', 'session']);
  });
});

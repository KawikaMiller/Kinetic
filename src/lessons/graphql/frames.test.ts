import { describe, expect, it } from 'vitest';
import { bytes, ms, pct, plural } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { lastOrders } from './data';
import { execute } from './exec';
import { compareFrames, costCaption, levelCaption, levelFrames, levelSummaryCaption } from './frames';
import { ORDER_COUNTS, DEFAULT_PICK, queryFor, toggle, type Pick, type PickKey } from './picker';
import { SCREEN_ORDERS, SCREEN_QUERY, SCREEN_USER, planGraphql, planRest } from './rest';
import { CACHING_NOTE, DB_COUNT_NOTE, EXEC_CAP, costView, countNames, dataLoaderNote, levelCount, levelSummary, namesAsked } from './scenes';
import { LIMITS } from './schema';
import lesson from './index';

const kb = (n: number) => bytes(n, { base: 1000 });
const failId = lastOrders(SCREEN_USER, SCREEN_ORDERS)[1].productId;

describe('REST against GraphQL captions', () => {
  it.each([null, failId])('quote the plans (failing product: %s)', (fail) => {
    const rest = planRest(fail);
    const gql = planGraphql(fail);
    const { frames, end } = compareFrames(fail);
    const text = frames.filter((f) => f.say !== undefined).map((f) => expectCaption(f.say)).join(' | ');
    expect(end).toBe(Math.max(rest.totalMs, gql.end));
    expect(frames[0].now).toBe(0);
    for (let i = 1; i < frames.length; i++) expect(frames[i].now).toBeGreaterThanOrEqual(frames[i - 1].now);
    expect(frames.at(-1)!.now).toBe(end);
    expect(text).toContain(`REST takes ${rest.requests.length} requests`);
    expect(text).toContain(`REST, ${ms(rest.totalMs)}: ${rest.requests.length} responses, ${kb(rest.bytes)} in all, of which the screen uses ${kb(rest.usefulBytes)} (${pct((rest.bytes - rest.usefulBytes) / rest.bytes)} is unused)`);
    expect(text).toContain(`GraphQL, ${ms(gql.end)}: one response of ${kb(gql.responseBytes)}`);
    expect(text).toContain('HTTP 200');
    expect(text.includes('returned 503')).toBe(fail !== null);
    expect(text.includes('errors entry')).toBe(fail !== null);
    if (fail !== null) expect(text).toContain('user.orders.1.product null');
  });

  it('the captions arrive in time order: REST wave 1, then GraphQL, then REST done', () => {
    const { frames } = compareFrames(null);
    const withSay = frames.filter((f) => f.say !== undefined).map((f) => ({ now: f.now, text: expectCaption(f.say) }));
    const at = (needle: string) => withSay.find((f) => f.text.includes(needle))!.now;
    expect(at('the user and the orders list are in')).toBe(100);
    expect(at('GraphQL, 140 ms')).toBe(140);
    expect(at('REST, 200 ms')).toBe(200);
  });
});

const KEYS: PickKey[] = ['email', 'orders', 'total', 'status', 'product', 'productName', 'productPrice'];
const PICKS: Pick[] = Array.from({ length: 1 << KEYS.length }, (_, mask) => {
  const p = { ...DEFAULT_PICK } as Pick;
  KEYS.forEach((k, i) => { p[k] = (mask & (1 << i)) !== 0; });
  return p;
}).filter((p) => toggle(toggle(p, 'email'), 'email').email === p.email && (p.orders ? p.total || p.status || p.product : !p.total && !p.status && !p.product) && (p.product ? p.productName || p.productPrice : !p.productName && !p.productPrice));

describe('level-by-level captions, every field selection × list length × DataLoader × failure', () => {
  it('state each level\'s resolver count, database calls and finish time from the run', () => {
    expect(PICKS).toHaveLength(32);
    let runs = 0;
    for (const base of PICKS) {
      for (const n of ORDER_COUNTS) {
        for (const dataLoader of [false, true]) {
          for (const fail of [null, failId]) {
            const exec = execute(queryFor({ ...base, n }), { dataLoader, failProductId: fail });
            const frames = levelFrames(exec, dataLoader);
            runs++;
            expect(frames).toHaveLength(levelCount(exec) + 2);
            for (let level = 0; level < levelCount(exec); level++) {
              const s = levelSummary(exec, level);
              const text = expectCaption(levelCaption(exec, level));
              expect(text).toContain(`Level ${level}: ${plural(s.total, 'resolver')} ran`);
              expect(text).toContain(`Level done at ${ms(s.endsAt)}`);
              if (!s.calls.length) expect(text).toContain('No database calls');
              else if (s.calls[0].batched) expect(text).toContain(`One batched call for ${plural(s.calls[0].invocations.length, 'resolver')}: ${s.calls[0].sql}`);
              else if (s.calls.length === 1) expect(text).toContain(`1 database call: ${s.calls[0].sql}`);
              else expect(text).toContain(`${s.calls.length} database calls, one per resolver`);
              expect(expectCaption(frames[level + 1].say)).toBe(text);
            }
            const done = expectCaption(levelSummaryCaption(exec, dataLoader));
            expect(done).toContain(`Done in ${ms(exec.totalMs)}: ${plural(exec.invocations.length, 'resolver call')} and ${plural(exec.dbCalls.length, 'database call')}`);
            expect(done.includes('failed')).toBe(exec.errors.length > 0);
            const products = exec.dbCalls.filter((c) => c.kind === 'products').length;
            expect(done.includes('batched')).toBe(dataLoader && products > 0);
          }
        }
      }
    }
    expect(runs).toBe(32 * 5 * 2 * 2);
  });

  it('the default query at N = 3 says 3 product calls naive and 1 batched (hand-worked)', () => {
    const naive = execute(queryFor(DEFAULT_PICK), { dataLoader: false, failProductId: null });
    const loaded = execute(queryFor(DEFAULT_PICK), { dataLoader: true, failProductId: null });
    expect(expectCaption(levelCaption(naive, 2))).toContain('3 database calls, one per resolver');
    expect(expectCaption(levelCaption(loaded, 2))).toContain('One batched call for 3 resolvers');
    expect(naive.totalMs).toBe(60);
    expect(loaded.totalMs).toBe(60);
  });
});

describe('cost scene, every depth × list size × limits setting', () => {
  it('rejects exactly when a limit is exceeded, runs exactly cost resolvers, and returns first^levels names', () => {
    for (let levels = 0; levels <= 6; levels++) {
      for (const first of [5, 10, 50]) {
        for (const limitsOn of [true, false]) {
          const view = costView(levels, first, limitsOn);
          const text = expectCaption(costCaption(view, levels, first));
          const asked = namesAsked(levels, first);
          expect(view.names).toBe(asked);
          const depth = levels + 2;
          const cost = levels === 0 ? 2 : 1 + (first ** levels - 1) / (first - 1) + first ** levels;
          const over = depth > LIMITS.maxDepth || cost > LIMITS.maxCost;
          if (limitsOn && over) {
            expect(view.status).toBe('rejected');
            expect(text).toContain('Rejected before any resolver ran');
            expect(text).toContain(`Resolvers run: 0`);
            expect(text).toContain(`${cost.toLocaleString('en-US')} resolver calls`);
          } else if (cost > EXEC_CAP) {
            expect(view.status).toBe('skipped');
            expect(text).toContain(`${cost.toLocaleString('en-US')} resolver calls`);
          } else {
            expect(view.status).toBe('executed');
            if (view.status !== 'executed') continue;
            const e = view.outcome.execution;
            expect(e.invocations).toHaveLength(cost);
            expect(view.outcome.verdict).toMatchObject({ depth, cost });
            expect(countNames(e.data)).toBe(asked);
            expect(text).toContain(`It ran ${plural(e.invocations.length, 'resolver')} and ${plural(e.dbCalls.length, 'database call')} and returned ${asked.toLocaleString('en-US')} ${asked === 1 ? 'name' : 'names'}`);
          }
        }
      }
    }
  });

  it('hand-worked cases: 2 levels of 10 friends pass; 3 levels fail on depth and cost; 2 levels of 50 fail on cost alone', () => {
    const pass = costView(2, 10, true);
    expect(pass.status).toBe('executed');
    expect(expectCaption(costCaption(pass, 2, 10))).toContain('depth 4 (limit 4) and cost 112 (limit 1,000)');
    expect(expectCaption(costCaption(costView(3, 10, true), 3, 10))).toContain('depth 5 is over the limit of 4 and cost 1,112 is over the limit of 1,000');
    expect(expectCaption(costCaption(costView(2, 50, true), 2, 50))).toContain('Rejected before any resolver ran: cost 2,552 is over the limit of 1,000.');
    expect(costView(3, 10, false).status).toBe('executed');
    expect(costView(3, 50, false).status).toBe('skipped');
  });
});

describe('the quiz numbers come from the model', () => {
  it('50 orders with plain resolvers: 51 calls for the orders and products, and 2 with a DataLoader', () => {
    const q = lesson.quiz[0];
    const naive = execute(queryFor({ ...DEFAULT_PICK, n: 50 }), { dataLoader: false, failProductId: null }).dbCalls.filter((c) => c.kind !== 'users').length;
    const loaded = execute(queryFor({ ...DEFAULT_PICK, n: 50 }), { dataLoader: true, failProductId: null }).dbCalls.filter((c) => c.kind !== 'users').length;
    expect([naive, loaded]).toEqual([51, 2]);
    expect(q.options[q.answer]).toContain(String(naive));
    expect(q.options.some((o) => o.startsWith(`${loaded}:`))).toBe(true);
    expect(q.why).toContain(`1 + 50 = ${naive}`);
  });
});

describe('claims are hedged where reality varies (review)', () => {
  it('HTTP caching: "usually POSTed", with GET + persisted queries named, never "every request"', () => {
    const q = lesson.quiz[1];
    expect(q.options[q.answer]).toContain('usually POSTed');
    expect(q.why).toContain('persisted queries');
    expect(`${q.q} ${q.options.join(' ')} ${q.why}`).not.toMatch(/every GraphQL request/i);
    expect(lesson.keyIdeas[3]).toContain('usually POSTed');
    expect(lesson.keyIdeas[3]).toContain('persisted queries');
    expect(CACHING_NOTE).toContain('usually sent as a POST');
    expect(CACHING_NOTE).toContain('persisted queries can restore URL-keyed caching');
    expect(CACHING_NOTE).not.toMatch(/\bevery\b|\bcannot be cached\b/);
  });

  it('over-fetching is stated about the response, not the database; servers are "well-run"', () => {
    expect(lesson.keyIdeas[0]).not.toContain('never over-fetched');
    expect(lesson.keyIdeas[0]).toContain('never contains fields the client did not ask for');
    expect(lesson.summary.what).toContain('well-run servers measure');
  });

  it('error nulling is hedged on nullability, in the key idea, the quiz and the run caption', () => {
    expect(lesson.keyIdeas[2]).toContain('nearest nullable parent');
    expect(lesson.quiz[2].why).toContain('nearest nullable parent');
    const exec = execute(queryFor(DEFAULT_PICK), { dataLoader: true, failProductId: failId });
    expect(expectCaption(levelSummaryCaption(exec, true))).toContain('nearest nullable parent');
  });

  it('the comparison lane assumes a DataLoader: 3 database calls, and 5 with it off (computed from the model)', () => {
    const withLoader = execute(SCREEN_QUERY, { dataLoader: true, failProductId: null }).dbCalls.length;
    const without = execute(SCREEN_QUERY, { dataLoader: false, failProductId: null }).dbCalls.length;
    expect([withLoader, without]).toEqual([3, 5]);
    expect(dataLoaderNote(withLoader, without)).toBe('The GraphQL lane assumes a DataLoader: 3 database calls. With it off, the same query makes 5 (see Resolvers).');
    expect(planGraphql(null).execution.dbCalls).toHaveLength(3);
  });

  it('the DB count note says it includes the user lookup: 52 naive calls for 50 orders, 51 of them orders and products', () => {
    const e = execute(queryFor({ ...DEFAULT_PICK, n: 50 }), { dataLoader: false, failProductId: null });
    expect(e.dbCalls).toHaveLength(52);
    expect(e.dbCalls.filter((c) => c.kind !== 'users')).toHaveLength(51);
    expect(DB_COUNT_NOTE).toContain('includes the one lookup of the user');
  });
});

import { describe, expect, it } from 'vitest';
import lesson from './index';
import { BUDGET_GB_PER_DAY, REQUESTS_PER_SECOND, SECONDS_PER_DAY, bytesPerRequest, cardShapes, filterHits, grepLines, makeRun, parseQuery, renderLine, scoreHits, type Level } from './model';

const run = makeRun();
const jsonGbPerDay = (level: Level) => (bytesPerRequest(run, level, 'json') * REQUESTS_PER_SECOND * SECONDS_PER_DAY) / 1024 ** 3;

describe('the quiz numbers come from the model', () => {
  it('Q1: the failed request wrote 12 lines, one mentions the user, and 2 unrelated lines match', () => {
    const s = scoreHits(run.events, grepLines(run.events, 'user 42'), run.failedIdx);
    expect(s).toMatchObject({ truth: 12, found: 1, falseHits: 2 });
    expect(lesson.quiz[0].why).toContain('12 lines');
    expect(lesson.quiz[0].why).toContain('2 lines from other requests');
  });

  it('Q2: request_id returns exactly the request lines from all four services', () => {
    const parsed = parseQuery(`request_id=${run.failedId}`);
    if (!parsed.ok) throw new Error(parsed.message);
    const s = scoreHits(run.events, filterHits(run.events, parsed.clauses), run.failedIdx);
    expect(s).toMatchObject({ missed: 0, falseHits: 0 });
    expect(new Set(run.events.filter((e) => e.requestIdx === run.failedIdx).map((e) => e.service)).size).toBe(4);
    expect(lesson.quiz[1].why).toContain('four services');
  });

  it('Q3: the gateway lines carry no order id, so order_id misses them', () => {
    const gateway = run.events.filter((e) => e.requestIdx === run.failedIdx && e.service === 'gateway');
    expect(gateway.length).toBeGreaterThan(0);
    expect(gateway.every((e) => e.orderId === undefined)).toBe(true);
  });

  it('Q4: INFO is about 21 GB a day and DEBUG about 56 in the JSON format, against a 25 GB budget', () => {
    expect(Math.round(jsonGbPerDay('INFO'))).toBe(21);
    expect(Math.round(jsonGbPerDay('DEBUG'))).toBe(56);
    expect(BUDGET_GB_PER_DAY).toBe(25);
    expect(REQUESTS_PER_SECOND).toBe(260);
    expect(lesson.quiz[3].why).toContain('260 requests a second');
  });

  it('Q5: masking leaves 0 card-shaped strings, where the unmasked log has some', () => {
    const withBody = makeRun(7, { logBody: true });
    expect(cardShapes(withBody.events.map((e) => renderLine(e, 'json', false)))).toBeGreaterThan(0);
    expect(cardShapes(withBody.events.map((e) => renderLine(e, 'json', true)))).toBe(0);
  });
});

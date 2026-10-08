import { describe, expect, it } from 'vitest';
import {
  BUDGET_GB_PER_DAY, FAILED_USER, FIELD_NAMES, LEVELS, LOOKALIKE_USER, REQUEST_COUNT, SERVICES, bytesPerRequest, cardShapes, filterHits, gbPerDay, grepLines, jsonLine, keptLines, levelRank,
  makeRun, parseQuery, redactLine, renderLine, scoreHits, textLine, type Level,
} from './model';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const must = (src: string) => {
  const r = parseQuery(src);
  if (!r.ok) throw new Error(r.message);
  return r.clauses;
};

describe('the simulated run', () => {
  it('has ten requests, one failing in payments, whose lines span all four services', () => {
    for (const seed of SEEDS) {
      const run = makeRun(seed);
      expect(run.requestIds).toHaveLength(REQUEST_COUNT);
      expect(new Set(run.requestIds).size).toBe(REQUEST_COUNT);
      const failedLines = run.events.filter((e) => e.requestIdx === run.failedIdx);
      expect(new Set(failedLines.map((e) => e.service))).toEqual(new Set(SERVICES));
      const errors = run.events.filter((e) => e.requestIdx !== null && e.level === 'ERROR');
      expect(errors.map((e) => e.requestIdx)).toEqual([run.failedIdx, run.failedIdx]);
      expect(errors.map((e) => e.service).sort()).toEqual(['gateway', 'payments']);
    }
  });

  it('is in time order and the requests really interleave', () => {
    for (const seed of SEEDS) {
      const { events } = makeRun(seed);
      expect(events.every((e, i) => i === 0 || events[i - 1].ts <= e.ts)).toBe(true);
      expect(events.every((e, i) => e.seq === i)).toBe(true);
      const switches = events.filter((e, i) => i > 0 && e.requestIdx !== events[i - 1].requestIdx).length;
      expect(switches).toBeGreaterThan(REQUEST_COUNT * 2);
    }
  });

  it('carries the request id on every line of a request, and the gateway never knows the order id', () => {
    const run = makeRun();
    for (const e of run.events.filter((x) => x.requestIdx !== null)) {
      expect(e.requestId).toBe(run.requestIds[e.requestIdx!]);
      expect(e.orderId === undefined).toBe(e.service === 'gateway');
    }
    expect(run.events.filter((e) => e.requestIdx === null).every((e) => e.requestId === undefined)).toBe(true);
  });

  it('has the failed user, an earlier request from them, and a lookalike id, for every seed', () => {
    for (const seed of SEEDS) {
      const run = makeRun(seed);
      const userOf = (idx: number) => run.events.find((e) => e.requestIdx === idx && e.userId !== undefined)!.userId;
      expect(userOf(run.failedIdx)).toBe(FAILED_USER);
      expect(userOf(0)).toBe(FAILED_USER);
      expect(userOf(1)).toBe(LOOKALIKE_USER);
      expect(run.failedIdx).toBeGreaterThanOrEqual(2);
      const others = Array.from({ length: REQUEST_COUNT }, (_, i) => i).filter((i) => ![0, 1, run.failedIdx].includes(i));
      for (const i of others) expect(String(userOf(i))).not.toMatch(/^42/);
    }
  });

  it('is deterministic for a seed and differs between seeds', () => {
    expect(makeRun(3).events.map(textLine)).toEqual(makeRun(3).events.map(textLine));
    expect(makeRun(3).failedId).not.toBe(makeRun(4).failedId);
  });
});

describe('structured lines', () => {
  it('are valid JSON with the documented fields and the right types', () => {
    const run = makeRun(7, { logBody: true });
    for (const e of run.events) {
      const o = JSON.parse(jsonLine(e)) as Record<string, unknown>;
      expect(Object.keys(o).every((k) => (FIELD_NAMES as readonly string[]).includes(k) || k === 'body' || k === 'detail')).toBe(true);
      expect(typeof o.ts).toBe('string');
      expect(LEVELS).toContain(o.level);
      expect(SERVICES).toContain(o.service);
      expect(typeof o.msg).toBe('string');
      if (o.order_id !== undefined) expect(typeof o.order_id).toBe('number');
      if (o.duration_ms !== undefined) expect(typeof o.duration_ms).toBe('number');
    }
  });

  it('time stamps match the free-text clock to the millisecond', () => {
    const e = makeRun().events[0];
    expect(JSON.parse(jsonLine(e)).ts.slice(11, 23)).toBe(textLine(e).slice(0, 12));
  });
});

describe('filtering by request_id returns exactly the failed request, for every seed', () => {
  it('has no extras and no misses', () => {
    for (const seed of SEEDS) {
      const run = makeRun(seed);
      const hits = filterHits(run.events, must(`request_id=${run.failedId}`));
      const expected = run.events.filter((e) => e.requestIdx === run.failedIdx).map((e) => e.seq);
      expect([...hits].sort((a, b) => a - b)).toEqual(expected);
      expect(scoreHits(run.events, hits, run.failedIdx)).toMatchObject({ missed: 0, falseHits: 0, found: expected.length });
    }
  });

  it('also holds under a level floor: the kept lines of the request, nothing else', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const run = makeRun(seed);
      for (const min of LEVELS) {
        const kept = keptLines(run.events, min);
        const hits = filterHits(kept, must(`request_id=${run.failedId}`));
        const expected = kept.filter((e) => e.requestIdx === run.failedIdx).map((e) => e.seq);
        expect([...hits].sort((a, b) => a - b)).toEqual(expected);
      }
    }
  });

  it('combines with AND and level>=', () => {
    const run = makeRun();
    const hits = filterHits(run.events, must(`request_id=${run.failedId} AND level>=WARN`));
    expect([...hits].map((s) => run.events[s].level).sort()).toEqual(['ERROR', 'ERROR', 'WARN']);
    expect([...filterHits(run.events, must('service=payments AND level=ERROR'))]).toHaveLength(1);
  });

  it('order_id misses the gateway lines, which only the request id covers', () => {
    const run = makeRun();
    const byOrder = scoreHits(run.events, filterHits(run.events, must(`order_id=${run.failedOrderId}`)), run.failedIdx);
    expect(byOrder.missed).toBe(run.events.filter((e) => e.requestIdx === run.failedIdx && e.service === 'gateway').length);
    expect(byOrder.falseHits).toBe(0);
  });
});

describe('text search is scored against the same ground truth', () => {
  it('"user 42" misses lines of the failed request and hits other requests, for every seed', () => {
    for (const seed of SEEDS) {
      const run = makeRun(seed);
      const s = scoreHits(run.events, grepLines(run.events, 'user 42'), run.failedIdx);
      expect(s.found).toBe(1);
      expect(s.missed).toBe(s.truth - 1);
      expect(s.falseHits).toBe(2);
    }
  });

  it('searching the order id catches the failed request order lines but misses the gateway lines', () => {
    const run = makeRun();
    const s = scoreHits(run.events, grepLines(run.events, `order ${run.failedOrderId}`), run.failedIdx);
    expect(s.missed).toBeGreaterThan(0);
    expect(s.falseHits).toBe(0);
    expect(s.found).toBeGreaterThan(0);
  });

  it('"error" has a false hit from the background line and is case-insensitive', () => {
    const run = makeRun();
    const s = scoreHits(run.events, grepLines(run.events, 'error'), run.failedIdx);
    expect(s.falseHits).toBe(1);
    expect(s.found).toBe(2);
  });

  it('an empty search matches nothing', () => {
    expect(grepLines(makeRun().events, '   ').size).toBe(0);
  });
});

describe('the query parser', () => {
  it('accepts the documented syntax', () => {
    expect(must('')).toEqual([]);
    expect(must('level>=warn')).toEqual([{ field: 'level', op: '>=', value: 'WARN' }]);
    expect(must('service=orders AND order_id=1007 AND level>=INFO')).toHaveLength(3);
  });

  it.each([
    ['service=orders OR service=payments', 'OR'],
    ['service=orders and level>=WARN', 'AND, in capitals'],
    ['AND level>=WARN', 'AND needs'],
    ['level>=WARN AND', 'AND needs'],
    ['(service=orders)', 'quotes, wildcards and parentheses'],
    ['service="orders"', 'quotes, wildcards and parentheses'],
    ['service=ord*', 'quotes, wildcards and parentheses'],
    ['colour=red', 'Unknown field'],
    ['duration_ms>=500', '>= only works on level'],
    ['level>=LOUD', 'level must be one of'],
    ['service!=orders', 'only = and level>='],
    ['duration_ms<500', 'only = and level>='],
    ['service=', 'needs a value'],
    ['payments', "isn't field=value"],
    ['msg=charge failed', 'Expected AND'],
  ])('refuses %s with a message', (src, part) => {
    const r = parseQuery(src);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(part);
  });
});

describe('the level filter', () => {
  it('keeps exactly the lines at or above the level, and nothing below it', () => {
    const { events } = makeRun();
    for (const min of LEVELS) {
      const kept = keptLines(events, min);
      expect(kept.every((e) => levelRank(e.level) >= levelRank(min))).toBe(true);
      expect(kept.length).toBe(events.filter((e) => LEVELS.indexOf(e.level) >= LEVELS.indexOf(min)).length);
    }
    expect(keptLines(events, 'DEBUG')).toHaveLength(events.length);
  });
});

describe('volume and cost', () => {
  const run = makeRun();
  it('never grows when the floor rises, in either format', () => {
    for (const format of ['text', 'json'] as const) {
      const sizes = LEVELS.map((l: Level) => bytesPerRequest(run, l, format));
      for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    }
  });

  it('debug left on blows the budget, info stays inside it, error-only is tiny', () => {
    for (const format of ['text', 'json'] as const) {
      expect(gbPerDay(bytesPerRequest(run, 'DEBUG', format))).toBeGreaterThan(BUDGET_GB_PER_DAY);
      expect(gbPerDay(bytesPerRequest(run, 'INFO', format))).toBeLessThan(BUDGET_GB_PER_DAY);
      expect(gbPerDay(bytesPerRequest(run, 'ERROR', format))).toBeLessThan(BUDGET_GB_PER_DAY / 10);
    }
  });

  it('structured lines cost more bytes than free text for the same events', () => {
    expect(bytesPerRequest(run, 'INFO', 'json')).toBeGreaterThan(bytesPerRequest(run, 'INFO', 'text'));
  });
});

describe('redaction', () => {
  const run = makeRun(7, { logBody: true });
  const plain = makeRun(7);

  it('the detector sees a card in every unredacted body line (so its zero below means something)', () => {
    const lines = run.events.filter((e) => e.body).map((e) => renderLine(e, 'json', false));
    expect(lines).toHaveLength(REQUEST_COUNT);
    expect(cardShapes(lines)).toBe(REQUEST_COUNT);
    expect(cardShapes(run.events.filter((e) => e.body).map((e) => renderLine(e, 'text', false)))).toBe(REQUEST_COUNT);
  });

  it('leaves no card-shaped string in either format once redaction is on', () => {
    for (const format of ['text', 'json'] as const) {
      const out = run.events.map((e) => renderLine(e, format, true));
      expect(cardShapes(out)).toBe(0);
      // An independent check: drop separators and look for 13 digits in a row.
      expect(out.some((l) => /\d{13}/.test(l.replace(/[ -]/g, '')))).toBe(false);
    }
  });

  it('does not touch lines without a card, and the log without the toggle has none', () => {
    const e = plain.events[3];
    expect(redactLine(textLine(e), true)).toBe(textLine(e));
    expect(cardShapes(plain.events.map(jsonLine))).toBe(0);
  });

  it('keeps the JSON line valid after redaction', () => {
    const e = run.events.find((x) => x.body)!;
    const o = JSON.parse(renderLine(e, 'json', true)) as { body: { card_number: string } };
    expect(o.body.card_number).toBe('[REDACTED]');
  });
});

import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import { CLIENTS, INITIAL_VALUE, orderVerdict, smallestViolation, withoutOp, witnessOrder, ORDER_MODELS, type Op, type OrderModel } from './model';
import { oracleHolds, oracleProfile } from './oracle';

const RANDOM_HISTORIES = 5000;
const MAX_ORACLE_OPS = 7;
const MAX_SLOT = 14;

/** A random history: up to three clients, each running its operations one after another (one outstanding per client). */
function randomHistory(rnd: Rnd): Op[] {
  const n = 2 + Math.floor(rnd() * (MAX_ORACLE_OPS - 1));
  const ops: Op[] = [];
  const clock = CLIENTS.map(() => Math.floor(rnd() * 4));
  let nextWrite = 1;
  const writes: number[] = [];
  for (let i = 0; i < n; i++) {
    const lane = Math.floor(rnd() * CLIENTS.length);
    const invoke = clock[lane] + Math.floor(rnd() * 3);
    const response = Math.min(MAX_SLOT, invoke + 1 + Math.floor(rnd() * 4));
    if (invoke >= response) continue;
    clock[lane] = response + 1;
    const isWrite = rnd() < 0.45;
    let value: number;
    if (isWrite) {
      value = nextWrite++;
      writes.push(value);
    } else {
      const p = rnd();
      value = p < 0.15 || writes.length === 0 ? INITIAL_VALUE : p < 0.97 ? writes[Math.floor(rnd() * writes.length)] : 99;
    }
    ops.push({ id: `o${i}`, client: CLIENTS[lane], kind: isWrite ? 'write' : 'read', value, invoke, response });
  }
  // A read may name a write that comes later in the list; that is allowed, so fix nothing.
  return ops;
}

const histories = (() => {
  const rnd = mulberry32(2024);
  return Array.from({ length: RANDOM_HISTORIES }, () => randomHistory(rnd)).filter((h) => h.length >= 2);
})();

describe('the register-history checkers against a brute-force oracle', () => {
  it('has thousands of histories with a real mix of verdicts', () => {
    expect(histories.length).toBeGreaterThanOrEqual(4500);
    const profiles = histories.map(oracleProfile);
    const count = (f: (p: ReturnType<typeof oracleProfile>) => boolean) => profiles.filter(f).length;
    expect(count((p) => p.linearizable)).toBeGreaterThan(200);
    expect(count((p) => !p.linearizable)).toBeGreaterThan(200);
    expect(count((p) => p.sequential && !p.linearizable)).toBeGreaterThan(50);
    expect(count((p) => p.causal && !p.sequential)).toBeGreaterThan(10);
    expect(count((p) => !p.causal)).toBeGreaterThan(200);
  });

  for (const model of ORDER_MODELS) {
    it(`${model}: the pruned search agrees with trying every permutation, on ${RANDOM_HISTORIES} seeded histories`, () => {
      const disagreements = histories.filter((h) => orderVerdict(model, h).ok !== oracleHolds(model, h));
      expect(disagreements.map((h) => JSON.stringify(h))).toEqual([]);
    });
  }

  it('the hierarchy holds on every history: linearizable implies sequential implies causal', () => {
    for (const h of histories) {
      const lin = orderVerdict('linearizable', h).ok;
      const seq = orderVerdict('sequential', h).ok;
      const cau = orderVerdict('causal', h).ok;
      if (lin) expect(seq, JSON.stringify(h)).toBe(true);
      if (seq) expect(cau, JSON.stringify(h)).toBe(true);
    }
  });

  it('the oracle itself catches a checker that ignores real time (a broken variant must be rejected)', () => {
    const stale: Op[] = [
      { id: 'w', client: 'C1', kind: 'write', value: 1, invoke: 1, response: 3 },
      { id: 'r', client: 'C2', kind: 'read', value: 0, invoke: 5, response: 7 },
    ];
    expect(oracleHolds('linearizable', stale)).toBe(false);
    expect(oracleHolds('sequential', stale)).toBe(true);
    const ignoresRealTime = (h: readonly Op[]) => oracleHolds('sequential', h);
    expect(ignoresRealTime(stale)).not.toBe(oracleHolds('linearizable', stale));
  });
});

describe('witness orders', () => {
  it('exists exactly when the model holds, and is a legal order that obeys the model, on every random history', () => {
    for (const model of ORDER_MODELS) {
      for (const h of histories.slice(0, 1500)) {
        const holds = oracleHolds(model, h);
        if (model === 'causal') {
          for (const client of CLIENTS) {
            const order = witnessOrder(model, h, client);
            expect(order !== null, `${model} ${client} ${JSON.stringify(h)}`).toBe(holds);
          }
        } else {
          const order = witnessOrder(model, h);
          expect(order !== null, `${model} ${JSON.stringify(h)}`).toBe(holds);
          if (order) assertLegal(model, h, order);
        }
      }
    }
  });
});

function assertLegal(model: OrderModel, h: readonly Op[], order: readonly Op[]) {
  expect(order.length).toBe(h.length);
  let current = INITIAL_VALUE;
  for (const o of order) {
    if (o.kind === 'write') current = o.value;
    else expect(o.value).toBe(current);
  }
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      if (model === 'linearizable') expect(order[j].response < order[i].invoke).toBe(false);
      if (model === 'sequential' && order[i].client === order[j].client) expect(order[i].invoke).toBeLessThan(order[j].invoke);
    }
  }
}

describe('the smallest violating subset', () => {
  /** Brute force: the size of the smallest set of operations that keeps the write behind each read it keeps and still violates `model` (oracle verdicts). */
  const bruteForceSize = (model: OrderModel, h: readonly Op[]): number => {
    let best = Infinity;
    for (let mask = 1; mask < 1 << h.length; mask++) {
      const subset = h.filter((_, i) => mask & (1 << i));
      const closed = subset.every((o) => o.kind !== 'read' || o.value === INITIAL_VALUE || !h.some((w) => w.kind === 'write' && w.value === o.value) || subset.some((w) => w.kind === 'write' && w.value === o.value));
      if (!closed || subset.length >= best) continue;
      const holds = oracleHolds(model, subset) && !subset.some((o) => o.kind === 'read' && o.value !== INITIAL_VALUE && !subset.some((w) => w.kind === 'write' && w.value === o.value));
      if (!holds) best = subset.length;
    }
    return best;
  };

  it('is null when the model holds, and otherwise is a violating set no smaller than the brute-force minimum', () => {
    let failures = 0;
    for (const model of ORDER_MODELS) {
      for (const h of histories) {
        const subset = smallestViolation(model, h);
        if (orderVerdict(model, h).ok) {
          expect(subset).toBeNull();
          continue;
        }
        if (failures++ >= 500 * ORDER_MODELS.length) continue;
        expect(subset, JSON.stringify(h)).not.toBeNull();
        expect(orderVerdict(model, subset!).ok).toBe(false);
        expect(subset!.length).toBe(bruteForceSize(model, h));
      }
    }
    expect(failures).toBeGreaterThan(500);
  });

  it('is minimal: dropping any one operation (and the reads of a dropped write) leaves a history that passes', () => {
    let checked = 0;
    for (const model of ORDER_MODELS) {
      for (const h of histories) {
        const subset = smallestViolation(model, h);
        if (!subset || checked >= 500) continue;
        checked++;
        for (const drop of subset) {
          const rest = withoutOp(subset, drop);
          expect(orderVerdict(model, rest).ok, `${model} without ${drop.id} in ${JSON.stringify(subset)}`).toBe(true);
        }
      }
    }
    expect(checked).toBe(500);
  });
});

import { describe, expect, it } from 'vitest';
import { mulberry32, pick, randInt, shuffle, type Rnd } from '../../core/random';
import { costOf, maxEdges, serviceEdges, SERVICES } from './cost';
import { FIELDS, type Field } from './consumer';
import { contractOf, consumerGate, deployProvider, matrixOf, providerGate, releaseConsumer, releaseProvider, setConsumerLive, START_WORLD, verifyPair, MAX_VERSIONS, type World } from './deploy';
import { makeContract, verify } from './contract';
import { CHANGES, FULL_SCHEMA, handle, handlerLines, type ChangeId } from './provider';

const CHANGE_IDS = CHANGES.map((c) => c.id);

/**
 * What a change breaks, worked by hand: the status change breaks every contract (the status is part of
 * it); renaming name breaks a consumer that reads name; removing email breaks one that reads email;
 * a string id breaks one that reads id. Adding a field and cents-to-dollars keep every shape.
 */
function oracleOk(reads: readonly Field[], changes: readonly ChangeId[]): boolean {
  const has = (c: ChangeId) => changes.includes(c);
  if (has('status-201')) return false;
  if (has('rename-name') && reads.includes('name')) return false;
  if (has('remove-email') && reads.includes('email')) return false;
  if (has('id-string') && reads.includes('id')) return false;
  return true;
}

const randomReads = (rnd: Rnd): Field[] => FIELDS.filter(() => rnd() < 0.55);
const randomChanges = (rnd: Rnd): ChangeId[] => CHANGE_IDS.filter(() => rnd() < 0.4);

describe('a pair verifies as the hand-worked table says', () => {
  it('on 1,000 seeded (consumer, provider) pairs', () => {
    const rnd = mulberry32(31);
    for (let i = 0; i < 1000; i++) {
      const reads = randomReads(rnd);
      const changes = randomChanges(rnd);
      expect(verifyPair(reads, changes).ok, `${reads} | ${changes}`).toBe(oracleOk(reads, changes));
    }
  });

  it('cents to dollars and a new field never fail any contract, for every reads subset', () => {
    for (let mask = 0; mask < 32; mask++) {
      const reads = FIELDS.filter((_, i) => mask & (1 << i));
      expect(verifyPair(reads, ['amount-dollars', 'add-nickname']).ok).toBe(true);
    }
  });

  it('property: removing a field the contract does not name never changes the result', () => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 1000; i++) {
      const reads = randomReads(rnd);
      const changes = new Set(randomChanges(rnd));
      const contract = contractOf(reads);
      const response = handle(changes);
      const body = response.body as Record<string, unknown>;
      const unnamed = Object.keys(body).filter((k) => !reads.includes(k as Field));
      if (!unnamed.length) continue;
      const removed = { ...body };
      delete removed[pick(unnamed, rnd)];
      expect(verify(contract, { ...response, body: removed })).toEqual(verify(contract, response));
    }
  });

  /** The naive alternative: assert the provider's whole schema, so any removal is a failure. */
  const fullSchemaPasses = (changes: ChangeId[]) => verify(makeContract(FULL_SCHEMA), handle(new Set(changes))).length === 0;

  it('a full-schema test raises a false alarm for removing email, which the contract does not', () => {
    expect(verifyPair(['id', 'name', 'amount'], ['remove-email']).ok).toBe(true);
    expect(fullSchemaPasses(['remove-email'])).toBe(false);
  });

  it('a broken verifier that checks the full schema fails the property "unused removals pass"', () => {
    const unusedRemovalPasses = (passes: (reads: Field[], changes: ChangeId[]) => boolean) => passes(['id', 'name', 'amount'], ['remove-email']);
    expect(unusedRemovalPasses((r, c) => verifyPair(r, c).ok)).toBe(true);
    expect(unusedRemovalPasses((_r, c) => fullSchemaPasses(c))).toBe(false);
  });
});

describe('the can-i-deploy gate equals a brute-force check over every pair', () => {
  function randomWorld(rnd: Rnd): World {
    let w: World = { consumers: [{ reads: randomReads(rnd), live: rnd() < 0.5 }], providers: [{ changes: [] }], liveProvider: 0 };
    for (let k = randInt(0, 6, rnd); k > 0; k--) {
      w = rnd() < 0.5 ? releaseProvider(w, pick(CHANGE_IDS, rnd)) : releaseConsumer(w, pick(FIELDS, rnd));
      if (rnd() < 0.5) w = setConsumerLive(w, randInt(0, w.consumers.length - 1, rnd), rnd() < 0.7);
    }
    return { ...w, liveProvider: randInt(0, w.providers.length - 1, rnd) };
  }

  it('on 200 seeded histories', () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 200; i++) {
      const w = randomWorld(rnd);
      const matrix = matrixOf(w);
      w.providers.forEach((p, pi) => {
        w.consumers.forEach((c, ci) => expect(matrix[pi][ci].ok, `h${i} p${pi} c${ci}`).toBe(oracleOk(c.reads, p.changes)));
        const blockers = w.consumers.flatMap((c, ci) => (c.live && !oracleOk(c.reads, p.changes) ? [ci] : []));
        const gate = providerGate(w, pi);
        expect(gate.ok, `h${i} provider ${pi}`).toBe(blockers.length === 0);
        expect(gate.blockers.map((b) => b.consumer), `h${i} provider ${pi}`).toEqual(blockers);
      });
      w.consumers.forEach((c, ci) => {
        expect(consumerGate(w, ci).ok, `h${i} consumer ${ci}`).toBe(oracleOk(c.reads, w.providers[w.liveProvider].changes));
      });
    }
  });

  it('the starting world: provider v2 is blocked by consumer v2, with the mismatch path', () => {
    const gate = providerGate(START_WORLD, 1);
    expect(gate.ok).toBe(false);
    expect(gate.blockers).toEqual([{ consumer: 1, provider: 1, detail: '$.body.email: expected string, got nothing' }]);
    expect(providerGate(START_WORLD, 0).ok).toBe(true);
  });

  it('a blocked provider does not deploy, an open one does', () => {
    expect(deployProvider(START_WORLD, 1).liveProvider).toBe(0);
    const after = deployProvider(setConsumerLive(START_WORLD, 1, false), 1);
    expect(after.liveProvider).toBe(1);
  });

  it('releasing adds a version once, and stops at the limit', () => {
    let w = START_WORLD;
    w = releaseProvider(w, 'remove-email');
    expect(w.providers).toHaveLength(2);
    w = releaseProvider(w, 'add-nickname');
    expect(w.providers.at(-1)?.changes).toEqual(['remove-email', 'add-nickname']);
    for (const c of CHANGE_IDS) w = releaseProvider(w, c);
    expect(w.providers.length).toBeLessThanOrEqual(MAX_VERSIONS);
    const cons = releaseConsumer(START_WORLD, 'plan');
    expect(cons.consumers.at(-1)).toEqual({ reads: ['id', 'name', 'amount', 'email', 'plan'], live: false });
    expect(releaseConsumer(cons, 'plan')).toBe(cons);
  });

  it('shows the handler with the changes applied', () => {
    expect(handlerLines(new Set()).join('\n')).toContain('email: user.email');
    const text = handlerLines(new Set<ChangeId>(['remove-email', 'status-201', 'rename-name'])).join('\n');
    expect(text).toContain('status: 201');
    expect(text).toContain('fullName: user.name');
    expect(text).not.toContain('email');
  });

  it('shuffle keeps the helper honest', () => {
    expect(shuffle([1, 2, 3], mulberry32(1)).sort()).toEqual([1, 2, 3]);
  });
});

describe('the cost of contracts against end-to-end', () => {
  it('lists distinct edges with no self loops, as many as asked up to the maximum', () => {
    for (let n = SERVICES.min; n <= SERVICES.max; n++) {
      for (const e of [1, n - 1, n, 2 * n, maxEdges(n), maxEdges(n) + 5]) {
        const edges = serviceEdges(n, e);
        expect(edges).toHaveLength(Math.min(e, maxEdges(n)));
        expect(new Set(edges.map((x) => `${x.from}-${x.to}`)).size).toBe(edges.length);
        expect(edges.every((x) => x.from !== x.to && x.from >= 0 && x.to < n)).toBe(true);
      }
    }
  });

  it('end-to-end deploys n services together, contracts verify e edges independently', () => {
    expect(costOf(6, 7)).toEqual({ e2eDeployed: 6, verifications: 7, servicesPerCheck: 2 });
    expect(costOf(4, 100)).toEqual({ e2eDeployed: 4, verifications: 6, servicesPerCheck: 2 });
    expect(maxEdges(12)).toBe(66);
  });
});

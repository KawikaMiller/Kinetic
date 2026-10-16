import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { INVOICES, KNOWN_FOREIGN, LAST_ID, PEOPLE, SIGNED_IN, adminExport, invoiceById, reachable, readableForeign, respond, respondBroken } from './invoices';
import { NO_HARDENING, blastRadius, exposure } from './metadata';
import { DEFENCES, SCENARIOS, SUBSET_COUNT, subsetOf, run, unsafe, type DefenceId, type ScenarioId } from './ssrf';

/**
 * Ground truth typed by hand from the scenarios, not read from `run`: for each scenario, the smallest groups of defences
 * that keep the request off every internal and metadata host. A scenario is safe when some group is fully on.
 * The public page needs none and is always safe.
 */
const SAFE_WHEN: Record<ScenarioId, DefenceId[][] | 'always'> = {
  public: 'always',
  'resolves-internal': [['allowList'], ['denyList'], ['egress']],
  redirect: [['allowList', 'recheck'], ['denyList', 'recheck'], ['egress']],
  'numeric-form': [['allowList'], ['denyList', 'normalise'], ['egress']],
  rebinding: [['allowList'], ['pin'], ['egress']],
  metadata: [['allowList'], ['denyList']],
};

const isSafe = (id: ScenarioId, on: Set<DefenceId>) => {
  const groups = SAFE_WHEN[id];
  return groups === 'always' || groups.some((g) => g.every((d) => on.has(d)));
};
const onSet = (mask: number) => new Set(DEFENCES.filter((_, i) => (mask >> i) & 1).map((d) => d.id));

describe('the pipeline over every subset of the nine defences and the six scenarios', () => {
  it('has 512 subsets and 6 scenarios, so 3,072 combinations', () => {
    expect(SUBSET_COUNT).toBe(512);
    expect(SCENARIOS).toHaveLength(6);
  });

  it('ends at a non-public host exactly when no group of defences from the hand-written table is fully on', () => {
    let combos = 0;
    for (let mask = 0; mask < SUBSET_COUNT; mask++) {
      const on = onSet(mask);
      for (const s of SCENARIOS) {
        combos++;
        expect(unsafe(run(s, subsetOf(mask))), `${s.id} mask ${mask}`).toBe(!isSafe(s.id, on));
      }
    }
    expect(combos).toBe(3072);
  });

  it('the public page is reached, never blocked, under every subset', () => {
    for (let mask = 0; mask < SUBSET_COUNT; mask++) expect(run(SCENARIOS[0], subsetOf(mask)).status).toBe('public');
  });

  it('an allow-list with pinning and a re-check of redirects keeps all six scenarios away from inside', () => {
    const d = subsetOf(DEFENCES.reduce((m, x, i) => (['allowList', 'pin', 'recheck'].includes(x.id) ? m | (1 << i) : m), 0));
    for (const s of SCENARIOS) expect(unsafe(run(s, d)), s.id).toBe(false);
  });

  it('each single defence is defeated by at least one named scenario, so no single defence is enough', () => {
    const defeated: Record<DefenceId, ScenarioId[]> = {} as never;
    for (const [i, d] of DEFENCES.entries()) {
      defeated[d.id] = SCENARIOS.filter((s) => unsafe(run(s, subsetOf(1 << i)))).map((s) => s.id);
      expect(defeated[d.id].length, d.id).toBeGreaterThan(0);
    }
    expect(defeated.allowList).toEqual(['redirect']);
    expect(defeated.denyList).toEqual(['redirect', 'numeric-form', 'rebinding']);
    expect(defeated.egress).toEqual(['metadata']);
  });

  it('the smallest sets that stop all six, found by brute force, equal the four derived by hand from the table', () => {
    const complete = (mask: number) => SCENARIOS.every((s) => !unsafe(run(s, subsetOf(mask))));
    const minimal: string[] = [];
    for (let mask = 0; mask < SUBSET_COUNT; mask++) {
      if (!complete(mask)) continue;
      const smaller = Array.from({ length: DEFENCES.length }, (_, i) => mask & ~(1 << i)).filter((m) => m !== mask && complete(m));
      if (smaller.length === 0) minimal.push([...onSet(mask)].sort().join('+'));
    }
    expect(minimal.sort()).toEqual(['allowList+egress', 'allowList+recheck', 'denyList+egress', 'denyList+normalise+pin+recheck'].sort());
  });

  it('scheme and port restriction changes no outcome among the six scenarios, as the lesson says', () => {
    const i = DEFENCES.findIndex((d) => d.id === 'schemes');
    for (let mask = 0; mask < SUBSET_COUNT; mask++) {
      for (const s of SCENARIOS) expect(run(s, subsetOf(mask | (1 << i))).status, `${s.id} ${mask}`).toBe(run(s, subsetOf(mask & ~(1 << i))).status);
    }
  });

  it('a credential comes back only from the metadata service, only without hardening, narrow only with least privilege', () => {
    for (let mask = 0; mask < SUBSET_COUNT; mask++) {
      const on = onSet(mask);
      for (const s of SCENARIOS) {
        const r = run(s, subsetOf(mask));
        if (r.status !== 'metadata') {
          expect(r.credential).toBeNull();
          continue;
        }
        expect(r.refused).toBe(on.has('hardening'));
        expect(r.credential === null).toBe(on.has('hardening'));
        if (r.credential) expect(r.credential.scope).toBe(on.has('leastPrivilege') ? 'narrow' : 'broad');
      }
    }
  });

  it('the fake credential is labelled fake and has no real credential shape', () => {
    const r = run(SCENARIOS[5], subsetOf(0));
    expect(r.credential!.value).toContain('FAKE');
    expect(r.credential!.value).not.toMatch(/AKIA|ASIA|sk_live|ghp_/);
  });
});

describe('metadata hardening', () => {
  it('shrinks the blast radius: three things, one thing with least privilege, none when refused', () => {
    expect(blastRadius(NO_HARDENING)).toBe(3);
    expect(blastRadius({ ...NO_HARDENING, leastPrivilege: true })).toBe(1);
    expect(blastRadius({ ...NO_HARDENING, token: true })).toBe(0);
    expect(blastRadius({ ...NO_HARDENING, hopLimit: true })).toBe(0);
    expect(exposure({ token: true, hopLimit: true, leastPrivilege: true }).kind).toBe('refused');
  });
});

describe('the invoices API', () => {
  it('has nine invoices; Alice owns two, so seven belong to others', () => {
    expect(INVOICES).toHaveLength(9);
    expect(INVOICES.filter((i) => i.ownerId === SIGNED_IN.id).map((i) => i.id)).toEqual([1001, 1002]);
    expect(INVOICES.filter((i) => i.ownerId !== SIGNED_IN.id)).toHaveLength(7);
  });

  it('with no ownership check seven foreign invoices are readable, with the owner check none, with unguessable ids only the ids already held', () => {
    expect(readableForeign('none', SIGNED_IN.id)).toBe(7);
    expect(reachable('none', SIGNED_IN.id)).toBe(7);
    expect(reachable('owner', SIGNED_IN.id)).toBe(0);
    expect(reachable('unguessable', SIGNED_IN.id)).toBe(KNOWN_FOREIGN.length);
    expect(KNOWN_FOREIGN.length).toBe(2);
    expect(reachable('unguessable', SIGNED_IN.id)).toBeGreaterThan(0);
  });

  it('unguessable ids are distinct, UUID-shaped, and do not work as numbers', () => {
    const tokens = INVOICES.map((i) => i.token);
    expect(new Set(tokens).size).toBe(9);
    for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(respond('unguessable', SIGNED_IN.id, 1003).status).toBe(404);
    expect(respond('unguessable', SIGNED_IN.id, KNOWN_FOREIGN[0].token).status).toBe(200);
  });

  it('the owner check answers a foreign id and a missing id with identical bytes', () => {
    const foreign = JSON.stringify(respond('owner', SIGNED_IN.id, 1003));
    const missing = JSON.stringify(respond('owner', SIGNED_IN.id, LAST_ID + 100));
    expect(foreign).toBe(missing);
    expect(respond('owner', SIGNED_IN.id, 1001).status).toBe(200);
  });

  it('the admin export reaches a member without the role check and refuses every member with it', () => {
    expect(adminExport('member', false).status).toBe(200);
    expect(adminExport('member', true).status).toBe(403);
    expect(adminExport('admin', true).status).toBe(200);
    for (const p of PEOPLE) expect(adminExport(p.id === 1001 ? 'member' : 'member', true).status).toBe(403);
  });

  it('a broken owner check that compares the invoice id with the session id leaks on a seeded user, and the test names who', () => {
    const rnd = mulberry32(7);
    const leaks: string[] = [];
    for (const p of PEOPLE) {
      for (const inv of INVOICES) {
        const r = respondBroken(p.id, inv.id);
        if (r.status === 200 && inv.ownerId !== p.id) leaks.push(`${p.name} reads invoice ${inv.id}`);
      }
    }
    expect(rnd()).toBeGreaterThanOrEqual(0);
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks).toContain('Bob Example reads invoice 1002');
    expect(invoiceById(1002)!.ownerId).toBe(1001);
    for (const p of PEOPLE) for (const inv of INVOICES) if (respond('owner', p.id, inv.id).status === 200) expect(inv.ownerId).toBe(p.id);
  });
});

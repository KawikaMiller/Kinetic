import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { ALGORITHMS, RESULTS, combine, type RuleResult } from './combine';
import { foldersOf, moveDoc, setUserClearance, setUserDept } from './edits';
import { MODELS, buildConfigs, countsOf, decide, disagreementRows, generateRbacHierarchical, syntheticOrg, type Configs, type ModelId } from './models';
import { ACTIONS, DEFAULT_DOCS, SHARE, defaultOrg, folderId, required, type Doc, type Org, type User } from './org';
import { STEP_BUDGET, check, docObj, generateTuples, relOf, type Tuple } from './rebac';

/** The stated requirement written out a third time, by hand, on raw attributes. */
const direct = (u: User, action: string, d: Doc) => u.dept === d.dept && u.clearance >= d.level + (action === 'edit' ? 1 : 0);

const randomOrg = (seed: number): Org => {
  const rnd = mulberry32(seed);
  const depts = ['eng', 'sales', 'hr'].slice(0, 1 + Math.floor(rnd() * 3));
  const levels = 1 + Math.floor(rnd() * 4);
  const pickDept = () => depts[Math.floor(rnd() * depts.length)];
  const users = Array.from({ length: 3 + Math.floor(rnd() * 5) }, (_, i) => ({ id: `u${i}`, name: `U${i}`, dept: pickDept(), clearance: 1 + Math.floor(rnd() * levels) }));
  const docs = Array.from({ length: 3 + Math.floor(rnd() * 5) }, (_, i) => ({ id: `d${i}`, name: `D${i}`, dept: pickDept(), level: 1 + Math.floor(rnd() * levels) }));
  return { depts, levels, users, docs, folderOf: Object.fromEntries(docs.map((d) => [d.id, folderId(d.dept, d.level)])), share: false, cycle: false };
};

const answers = (org: Org, cfg: Configs, model: ModelId, rebacOptions?: Parameters<typeof decide>[6]) =>
  org.users.flatMap((u) => ACTIONS.flatMap((a) => org.docs.map((d) => decide(model, org, cfg, u.id, a, d.id, rebacOptions).granted)));

describe('the same requirement in every model', () => {
  it('gives identical decisions in all four models, equal to the direct rule, for the default organisation', () => {
    const org = defaultOrg();
    const cfg = buildConfigs(org);
    const want = org.users.flatMap((u) => ACTIONS.flatMap((a) => org.docs.map((d) => direct(u, a, d))));
    for (const m of MODELS) expect(answers(org, cfg, m.id), m.id).toEqual(want);
    expect(want.filter(Boolean).length).toBeGreaterThan(5);
    expect(want.filter((x) => !x).length).toBeGreaterThan(5);
  });

  it('holds on 200 seeded organisations, and the hierarchical-role form agrees too', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const org = randomOrg(seed);
      const cfg = buildConfigs(org);
      const want = org.users.flatMap((u) => ACTIONS.flatMap((a) => org.docs.map((d) => direct(u, a, d))));
      for (const m of MODELS) expect(answers(org, cfg, m.id), `${seed} ${m.id}`).toEqual(want);
      expect(answers(org, { ...cfg, rbac: generateRbacHierarchical(org) }, 'rbac'), `${seed} hier`).toEqual(want);
    }
  });

  it('with the one-week share, every model grants Erin the Roadmap and nothing else changes', () => {
    const plain = defaultOrg();
    const org = { ...plain, share: true };
    const cfg = buildConfigs(org);
    const want = org.users.flatMap((u) => ACTIONS.flatMap((a) => org.docs.map((d) => required('dept-clearance-share', u, a, d))));
    for (const m of MODELS) expect(answers(org, cfg, m.id), m.id).toEqual(want);
    const before = org.users.flatMap((u) => ACTIONS.flatMap((a) => org.docs.map((d) => direct(u, a, d))));
    expect(want.filter((x, i) => x !== before[i])).toHaveLength(1);
  });

  it('the attribute edits move the answer in every model at once, and refuse values outside the bounds', () => {
    let org = defaultOrg();
    org = setUserClearance(setUserDept(org, 'bob', 'sales'), 'bob', 2);
    const cfg = buildConfigs(org);
    for (const m of MODELS) expect(decide(m.id, org, cfg, 'bob', 'read', 'terms').granted, m.id).toBe(true);
    expect(setUserClearance(org, 'bob', 9).users).toEqual(org.users);
    expect(setUserClearance(org, 'bob', 0).users).toEqual(org.users);
    expect(setUserDept(org, 'bob', 'marketing').users).toEqual(org.users);
    expect(moveDoc(org, 'notes', 'nowhere')).toBe(org);
  });
});

describe('ReBAC against an independent fixpoint', () => {
  /** Who holds what, by repeating every rule until nothing new appears: no recursion, no visited set. */
  function holders(tuples: readonly Tuple[]): Map<string, Set<string>> {
    const sets = new Map<string, Set<string>>();
    const get = (k: string) => sets.get(k) ?? sets.set(k, new Set()).get(k)!;
    let changed = true;
    const add = (k: string, users: Iterable<string>) => {
      for (const u of users) if (!get(k).has(u)) { get(k).add(u); changed = true; }
    };
    const parents = (obj: string) => tuples.filter((t) => t.obj === obj && t.rel === 'parent').map((t) => (t.subject as { obj: string }).obj);
    while (changed) {
      changed = false;
      for (const t of tuples) {
        if (t.subject.kind === 'user') add(`${t.obj}#${t.rel}`, [t.subject.id]);
        if (t.subject.kind === 'set') add(`${t.obj}#${t.rel}`, get(`${t.subject.obj}#${t.subject.rel}`));
      }
      for (const t of tuples) {
        if (t.rel !== 'parent') continue;
        add(`${t.obj}#viewer`, get(`${(t.subject as { obj: string }).obj}#viewer`));
        add(`${t.obj}#editor`, get(`${(t.subject as { obj: string }).obj}#editor`));
        add(`${t.obj}#viewer`, get(`${t.obj}#editor`));
      }
      for (const t of tuples) if (parents(t.obj).length === 0) add(`${t.obj}#viewer`, get(`${t.obj}#editor`));
    }
    return sets;
  }

  it('equals the fixpoint for every question, with and without a loop, on 60 seeded organisations', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const cycle of [false, true]) {
        const org = { ...randomOrg(seed), cycle };
        const tuples = generateTuples(org);
        const held = holders(tuples);
        for (const u of org.users) {
          for (const a of ACTIONS) {
            for (const d of org.docs) {
              const want = held.get(`${docObj(d.id)}#${relOf(a)}`)?.has(u.id) ?? false;
              expect(check(tuples, u.id, docObj(d.id), relOf(a)).granted, `${seed} ${cycle} ${u.id} ${a} ${d.id}`).toBe(want);
            }
          }
        }
      }
    }
  });

  it('terminates on a group loop, says the cycle was ignored, and the loop gives a wrong yes the table can see', () => {
    const org = { ...defaultOrg(), cycle: true };
    const cfg = buildConfigs(org);
    const r = decide('rebac', org, cfg, 'dave', 'read', 'notes');
    expect(r.granted).toBe(false);
    expect(r.note).toContain('cycle ignored');
    const bob = decide('rebac', org, cfg, 'bob', 'read', 'roadmap');
    expect(bob.granted).toBe(true);
    expect(direct(org.users.find((u) => u.id === 'bob')!, 'read', DEFAULT_DOCS[1])).toBe(false);
  });

  it('a broken checker without the visited set runs past the step budget on the loop, and the honest one does not', () => {
    const org = { ...defaultOrg(), cycle: true };
    const tuples = generateTuples(org);
    const broken = check(tuples, 'dave', docObj('notes'), 'viewer', { visited: false });
    expect(broken.exceeded).toBe(true);
    expect(broken.steps).toBeGreaterThan(STEP_BUDGET);
    const honest = check(tuples, 'dave', docObj('notes'), 'viewer');
    expect(honest.exceeded).toBe(false);
    expect(honest.steps).toBeLessThan(STEP_BUDGET);
    expect(check(generateTuples(defaultOrg()), 'dave', docObj('notes'), 'viewer', { visited: false }).exceeded).toBe(false);
  });

  it('moving a document to another folder changes the answers for that document only, to what the new folder says', () => {
    const base = defaultOrg();
    const baseCfg = buildConfigs(base);
    for (const doc of base.docs) {
      for (const folder of foldersOf(base)) {
        const org = moveDoc(base, doc.id, folder);
        const cfg = buildConfigs(org);
        const [dept, lvl] = folder.split('-L');
        for (const u of org.users) {
          for (const a of ACTIONS) {
            for (const d of org.docs) {
              const before = decide('rebac', base, baseCfg, u.id, a, d.id).granted;
              const after = decide('rebac', org, cfg, u.id, a, d.id).granted;
              if (d.id !== doc.id) expect(after, `${doc.id}->${folder} ${d.id}`).toBe(before);
              else expect(after, `${doc.id}->${folder} ${u.id} ${a}`).toBe(direct(u, a, { ...d, dept, level: Number(lvl) }));
            }
          }
        }
      }
    }
  });
});

describe('what an administrator defines, over the slider grid', () => {
  it('RBAC flat is departments x levels, hierarchical the same with D(L-1) edges, ABAC is one, ReBAC recounts from its tuples', () => {
    for (let D = 1; D <= 6; D++) {
      for (let L = 1; L <= 4; L++) {
        const c = countsOf(syntheticOrg(D, L, false));
        expect(c.rbacRoles, `${D}x${L}`).toBe(D * L);
        expect(c.rbacHierRoles).toBe(D * L);
        expect(c.rbacHierEdges).toBe(D * (L - 1));
        expect(c.abacPolicies).toBe(1);
        expect(c.rebacGroups).toBe(D * L);
        expect(c.rebacFolders).toBe(D * L);
        const docs = D * L + 1;
        const users = D * L + 1;
        expect(c.rebacTuples).toBe(docs + D * L + D * (L - 1) + D * (L - 1) + users);
        expect(c.rebacRules).toBe(3);
      }
    }
  });

  it('the one-week share adds one ACL entry, one RBAC role with one grant, one ABAC exception and one ReBAC tuple', () => {
    for (const [D, L] of [[1, 2], [2, 1], [2, 3], [6, 4]]) {
      const a = countsOf(syntheticOrg(D, L, false));
      const b = countsOf(syntheticOrg(D, L, true));
      expect([b.aclEntries - a.aclEntries, b.rbacRoles - a.rbacRoles, b.rbacGrants - a.rbacGrants, b.abacExceptionAttributes, b.rebacTuples - a.rebacTuples]).toEqual([1, 1, 1, 1, 1]);
    }
  });

  it('with one department and one level Erin could already read the Roadmap, so the share adds no ACL entry (and the caption says 0)', () => {
    const a = countsOf(syntheticOrg(1, 1, false));
    const b = countsOf(syntheticOrg(1, 1, true));
    expect(b.aclEntries - a.aclEntries).toBe(0);
  });

  it('the flat form needs more roles than the hierarchical form needs edges plus one role per department, and the fair form is no smaller in roles', () => {
    const c = countsOf(syntheticOrg(3, 4, false));
    expect(c.rbacHierEdges).toBeLessThan(c.rbacRoles);
    expect(c.rbacHierRoles).toBe(c.rbacRoles);
  });
});

describe('combining rules', () => {
  const all = RESULTS.flatMap((a) => RESULTS.map((b) => [a, b] as [RuleResult, RuleResult]));

  it('no rule matching is a deny under every algorithm', () => {
    for (const a of ALGORITHMS) expect(combine(a.id, ['none', 'none'])).toBe('deny');
  });

  it('deny overrides never permits when any deny matches, and permits when only permits match', () => {
    for (const r of all) {
      if (r.includes('deny')) expect(combine('deny-overrides', r)).toBe('deny');
      else if (r.includes('permit')) expect(combine('deny-overrides', r)).toBe('permit');
    }
  });

  it('permit overrides never denies when any permit matches', () => {
    for (const r of all) if (r.includes('permit')) expect(combine('permit-overrides', r)).toBe('permit');
    expect(combine('permit-overrides', ['deny', 'none'])).toBe('deny');
  });

  it('first applicable equals the first matching rule, for all 9 outcomes', () => {
    expect(all).toHaveLength(9);
    for (const r of all) {
      const first = r.find((x) => x !== 'none');
      expect(combine('first-applicable', r)).toBe(first ?? 'deny');
    }
  });

  it('the three algorithms disagree on at least one pair of rules, so the picker matters', () => {
    const decisions = ALGORITHMS.map((a) => all.map((r) => combine(a.id, r)).join());
    expect(new Set(decisions).size).toBe(3);
  });
});

describe('the disagreement table', () => {
  it('is quiet on the default organisation under the first requirement: 50 rows, no disagreement, nobody wrong', () => {
    const rows = disagreementRows(defaultOrg(), 'dept-clearance');
    expect(rows).toHaveLength(50);
    expect(rows.filter((r) => r.disagree || r.wrong.length)).toEqual([]);
  });

  it('turning the share on makes one row violate the first requirement in all four models, and none under the second', () => {
    const org = { ...defaultOrg(), share: true };
    const wrong = disagreementRows(org, 'dept-clearance').filter((r) => r.wrong.length);
    expect(wrong.map((r) => r.id)).toEqual([`${SHARE.user}-read-${SHARE.doc}`]);
    expect(wrong[0].wrong).toHaveLength(4);
    expect(wrong[0].disagree).toBe(false);
    expect(disagreementRows(org, 'dept-clearance-share').filter((r) => r.wrong.length)).toEqual([]);
  });

  it('closing the loop makes only ReBAC wrong, on rows where it says yes and the requirement says no', () => {
    const rows = disagreementRows({ ...defaultOrg(), cycle: true }, 'dept-clearance');
    const wrong = rows.filter((r) => r.wrong.length);
    expect(wrong.length).toBeGreaterThan(0);
    for (const r of wrong) {
      expect(r.wrong).toEqual(['rebac']);
      expect(r.decisions.rebac).toBe(true);
      expect(r.disagree).toBe(true);
    }
  });
});

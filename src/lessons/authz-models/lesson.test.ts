import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { ALGORITHMS, RESULTS, combine } from './combine';
import { askCaption, combineCaption, countCaption, disagreeCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { MODELS, disagreementRows } from './models';
import { OPENING } from './opening';
import { ACTIONS, REQUIREMENTS, defaultOrg } from './org';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('authz-models');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('authz-models')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state', () => {
    expect(OPENING.scene).toBe('ask');
    expect(OPENING.org()).toEqual(OPENING.org());
    expect(OPENING.ask).toEqual({ model: 'acl', user: 'alice', action: 'read', doc: 'notes' });
    expect(OPENING.count).toMatchObject({ departments: 2, levels: 3 });
    expect(OPENING.combine).toEqual({ algorithm: 'deny-overrides', rules: ['permit', 'deny'] });
    expect(OPENING.org().share).toBe(false);
    expect(OPENING.org().cycle).toBe(false);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the same granted answer under four models, with 1, 2, 6 and 4 edges on the lit path', () => {
    expect([FACTS.aclEdges, FACTS.rbacEdges, FACTS.abacEdges, FACTS.rebacEdges]).toEqual([1, 2, 6, 4]);
    expect(lesson.tryThis[0]).toContain('has 1 edge. Switch the model to RBAC: 2 edges, to ABAC: 6, to ReBAC: 4');
  });

  it('try-this 2: Bob is told no entry names him; after the share Erin reads the Roadmap but cannot edit it', () => {
    expect(FACTS.bobRoadmapAcl).toBe('No entry on Roadmap names Bob for read.');
    expect([FACTS.erinReadAfterShare, FACTS.erinEditAfterShare]).toEqual([true, false]);
    expect(lesson.tryThis[1]).toContain('read is granted and edit is denied');
  });

  it('try-this 3: the table is quiet by default; a loop makes rows differ in ReBAC only; the share makes exactly one row differ in all four', () => {
    expect(disagreementRows(defaultOrg(), 'dept-clearance').filter((r) => r.wrong.length)).toEqual([]);
    expect(FACTS.loopOnlyRebac).toBe(true);
    expect(FACTS.wrongAfterLoop).toBeGreaterThan(0);
    expect(FACTS.wrongAfterShare).toBe(1);
    expect(lesson.tryThis[2]).toContain(`${FACTS.wrongAfterLoop} rows differ from the requirement, all in ReBAC`);
    expect(lesson.tryThis[2]).toContain('1 row differs, in all four models');
  });

  it('try-this 4: 6 flat roles, 6 hierarchical roles with 4 edges and 1 ABAC policy by default; 24 flat roles at 6 x 4', () => {
    expect([FACTS.roles, FACTS.hierRoles, FACTS.hierEdges, FACTS.policies, FACTS.bigRoles]).toEqual([6, 6, 4, 1, 24]);
    expect(lesson.tryThis[3]).toContain('6 roles, the hierarchical form 6 roles and 4 inheritance edges, ABAC 1 policy');
  });

  it('try-this 5: permit and deny under deny overrides is deny, permit overrides permit, first applicable permit, and deny after the swap', () => {
    expect([FACTS.defaultDecision, FACTS.permitOverrides, FACTS.firstApplicable, FACTS.firstApplicableSwapped]).toEqual(['deny', 'permit', 'permit', 'deny']);
    expect(lesson.tryThis[4]).toContain('the decision is deny. Choose permit overrides: permit. Choose first applicable: permit. Press "Swap the order": deny.');
  });
});

describe('the control cross product', () => {
  it('every model, user, action and document gives a clean caption', () => {
    const org = defaultOrg();
    for (const m of MODELS) {
      for (const u of org.users) {
        for (const a of ACTIONS) {
          for (const d of org.docs) expect(expectCaption(askCaption(org, m.id, u.id, a, d.id)), `${m.id} ${u.id} ${a} ${d.id}`).not.toMatch(/NaN|undefined|\[object/);
        }
      }
    }
    const looped = { ...org, cycle: true };
    expect(expectCaption(askCaption(looped, 'rebac', 'dave', 'read', 'notes'))).toContain('cycle ignored');
    expect(expectCaption(askCaption(looped, 'rebac', 'dave', 'read', 'notes'))).toContain('configuration is the bug');
    expect(expectCaption(askCaption(org, 'rebac', 'dave', 'read', 'notes'))).not.toContain('cycle ignored');
  });

  it('every requirement and organisation edit gives a clean disagreement caption', () => {
    for (const req of REQUIREMENTS) {
      for (const [share, cycle] of [[false, false], [true, false], [false, true], [true, true]]) {
        const rows = disagreementRows({ ...defaultOrg(), share, cycle }, req.id);
        expect(expectCaption(disagreeCaption(rows, req.id))).not.toMatch(/NaN|undefined|\[object/);
      }
    }
  });

  it('every slider position and requirement gives a clean counting caption that states the counts it computed', () => {
    for (let d = 1; d <= 6; d++) {
      for (let l = 1; l <= 4; l++) {
        const first = expectCaption(countCaption(d, l, 'dept-clearance'));
        expect(first).toContain(`flat RBAC needs ${d * l} roles`);
        expect(first).toContain(`${d * (l - 1)} inheritance edge`);
        expect(expectCaption(countCaption(d, l, 'dept-clearance-share'))).not.toMatch(/NaN|undefined|\[object/);
        expect(expectCaption(countCaption(d, l, 'dept-clearance-share')).includes('nothing changes'), `${d}x${l}`).toBe(d === 1 && l === 1);
      }
    }
  });

  it('every algorithm and pair of rule outcomes gives a clean combining caption naming the computed decision', () => {
    for (const a of ALGORITHMS) {
      for (const r1 of RESULTS) {
        for (const r2 of RESULTS) expect(expectCaption(combineCaption(a.id, [r1, r2]))).toContain(`: ${combine(a.id, [r1, r2])}.`);
      }
    }
  });
});

describe('the lesson stays inside the simulation', () => {
  const FORBIDDEN = /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\(|new Function/;

  it('has no network call and no eval in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    for (const [file, text] of Object.entries(sources)) expect(text, file).not.toMatch(FORBIDDEN);
  });

  it('chips every scene as simulated or a toy', () => {
    for (const file of ['./AskScene.tsx', './DisagreeScene.tsx', './CountScene.tsx']) expect(sources[file]).toContain('<Provenance kind="simulated">');
    expect(sources['./CombineScene.tsx']).toContain('<Provenance kind="toy">');
    expect(sources['./AskScene.tsx']).toContain('<Provenance kind="from-memory">');
  });
});

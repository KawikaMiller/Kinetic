import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { cooldownCaption, integrityCaption, matrixCaption, provenanceCaption, spreadCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { fakeTarball, flipByte, hashBytes } from './integrity';
import { DEFENCE_ORDER, allDefenceSets } from './matrix';
import { COOLDOWN_RANGE, INSTALL_DAY_RANGE, initialIntegrity, initialMatrix, initialProvenance, initialSpread } from './opening';
import { SCENARIO_ORDER, buildCase, passes, verify } from './provenance';
import { SERVICE_NAMES } from './registry';
import { installAll } from './resolve';
import { holders, sbomOf } from './sbom';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CLEAN = /NaN|undefined|\[object|null/;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('supply-chain-security');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('supply-chain-security')).toEqual([]);
  });

  it('each scene opens on its own fresh state, and editing one copy does not change the next', () => {
    const m = initialMatrix();
    m.defences.push('sbom');
    expect(initialMatrix().defences).toEqual(['pin-lock', 'integrity']);
    expect(initialSpread()).toEqual({ policy: 'ranges', lockWhen: 'before' });
    expect(initialIntegrity()).toEqual({ flipped: null, checkOn: true, installDay: 2, cooldown: 0 });
    expect(initialProvenance()).toEqual({ scenario: 'genuine', query: 'tiny-pad' });
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: ranges put tiny-pad@1.2.1 in 3 of 3 services and 9 packages; a lockfile before the release in 0; after it in 3', () => {
    const s = initialSpread();
    expect(s).toMatchObject({ policy: 'ranges', lockWhen: 'before' });
    expect([FACTS.rangesServices, FACTS.rangesPackages, FACTS.lockBeforeServices, FACTS.lockAfterServices, FACTS.exactServices]).toEqual([3, 9, 0, 3, 0]);
    expect(expectCaption(spreadCaption('ranges', 'before'))).toContain('3 services of 3 and 9 packages run tiny-pad@1.2.1');
    expect(expectCaption(spreadCaption('lockfile', 'after'))).toContain('a lock records what was picked, it does not make it trustworthy');
    expect(lesson.tryThis[0]).toContain('Ranges with a lockfile: 0 services');
  });

  it('try-this 2: installed at day 2; any flipped byte is refused with the check on and installed changed with it off; cooldown 3 holds the release back', async () => {
    const o = initialIntegrity();
    expect(FACTS.openingStatus).toBe('picked-up');
    expect(FACTS.heldBackStatus).toBe('held-back');
    expect(FACTS.withdrawnStatus).toBe('withdrawn');
    const genuine = fakeTarball();
    const recorded = await hashBytes(genuine);
    const actual = await hashBytes(flipByte(genuine, 0));
    expect(expectCaption(integrityCaption(0, true, recorded, actual))).toContain('refuses the install');
    expect(expectCaption(integrityCaption(0, false, recorded, actual))).toContain('same version number, different bytes');
    expect(expectCaption(cooldownCaption(o.installDay, 3))).toContain('holds tiny-pad@1.2.1 back on day 2');
    expect(lesson.tryThis[1]).toContain('the install is refused');
  });

  it('try-this 3: 0 blocked, 4 limited, 2 open; scopes make 1 blocked; all seven give 2 blocked and 4 limited; tiny-pas is 1 edit from tiny-pad', () => {
    expect(FACTS.matrixOpening).toEqual({ blocked: 0, limited: 4, open: 2 });
    expect(FACTS.matrixScopes).toEqual({ blocked: 1, limited: 3, open: 2 });
    expect(FACTS.matrixAll).toEqual({ blocked: 2, limited: 4, open: 0 });
    expect([FACTS.nameTyped, FACTS.nameNear, FACTS.nameDistance]).toEqual(['tiny-pas', 'tiny-pad', 1]);
    expect(expectCaption(matrixCaption(initialMatrix().defences, initialMatrix().name))).toContain('is 1 edit from tiny-pad');
    expect(lesson.tryThis[2]).toContain('2 are blocked and 4 only limited');
  });

  it('try-this 4: the genuine build passes, a repackaged artifact fails the artifact hash, and 3 of 3 services contain tiny-pad', async () => {
    expect(initialProvenance().scenario).toBe('genuine');
    expect(passes(await verify((await buildCase('genuine'))!))).toBe(true);
    const repackaged = await verify((await buildCase('repackaged'))!);
    expect(repackaged.filter((c) => !c.ok).map((c) => c.id)).toEqual(['artifact']);
    expect(FACTS.sbomHolders).toBe(3);
    expect(lesson.tryThis[3]).toContain('3 of 3');
  });
});

describe('captions across the control cross product', () => {
  it('spread: every policy and lockfile timing is clean and says what the installs did', () => {
    for (const policy of ['ranges', 'lockfile', 'exact'] as const) {
      for (const lockWhen of ['before', 'after'] as const) {
        const text = expectCaption(spreadCaption(policy, lockWhen));
        expect(text).not.toMatch(CLEAN);
        const affected = installAll(policy, lockWhen, { day: 2, cooldown: 0 });
        const hit = SERVICE_NAMES.filter((s) => affected.get(s)?.get('tiny-pad') === '1.2.1').length;
        expect(text.includes('No service runs'), `${policy} ${lockWhen}`).toBe(hit === 0);
      }
    }
  });

  it('cooldown: every install day and cooldown is clean and names the status', () => {
    for (let day = INSTALL_DAY_RANGE.min; day <= INSTALL_DAY_RANGE.max; day++) {
      for (let cooldown = COOLDOWN_RANGE.min; cooldown <= COOLDOWN_RANGE.max; cooldown++) {
        const text = expectCaption(cooldownCaption(day, cooldown));
        expect(text).not.toMatch(CLEAN);
        expect(/pulled|holds|is installed/.test(text)).toBe(true);
      }
    }
  });

  it('matrix: all 128 defence sets, a warning name and hostile names give clean captions', () => {
    const names = ['', 'tiny-pas', 'tiny-pad', 'zzzzzzzzzz', 'Tiny Pad', '<b>x</b>', 'a'.repeat(41)];
    for (const on of allDefenceSets()) {
      const defences = DEFENCE_ORDER.filter((d) => on.has(d));
      for (const name of names) expect(expectCaption(matrixCaption(defences, name))).not.toMatch(CLEAN);
    }
    expect(expectCaption(matrixCaption([], 'Tiny Pad'))).toContain('The name is refused: Position 1');
  });

  it('provenance: every scenario and a hostile query give clean captions', async () => {
    const boms = sbomOf(installAll('ranges', 'before', { day: 2, cooldown: 0 }));
    for (const id of SCENARIO_ORDER) {
      const checks = await verify((await buildCase(id))!);
      for (const query of ['', 'tiny-pad', 'svg-core', 'nothing-here']) {
        const text = expectCaption(provenanceCaption(checks, passes(checks), query, holders(boms, query), null));
        expect(text).not.toMatch(CLEAN);
        expect(text.includes('Every check passes')).toBe(passes(checks));
        // a failed check is named as one that did not hold, never printed as if its positive label were the finding
        for (const c of checks.filter((x) => !x.ok)) {
          expect(text).toContain('Did not hold: ');
          expect(text).toContain(c.label);
        }
      }
    }
    expect(expectCaption(provenanceCaption(null, false, '', [], null))).toContain('Checking');
    expect(expectCaption(provenanceCaption(null, false, 'X', [], 'Position 1: bad'))).toContain('The name is refused');
  });
});

describe('the lesson stays inside the simulation', () => {
  it('has no network call and no eval in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(forbiddenCalls(sources)).toEqual([]);
  });

  it('chips every scene as simulated', () => {
    for (const file of ['./SpreadScene.tsx', './IntegrityScene.tsx', './MatrixScene.tsx', './ProvenanceScene.tsx']) expect(sources[file]).toContain('<Provenance kind="simulated">');
    expect(sources['./ProvenanceScene.tsx']).toContain('<Provenance kind="from-memory">');
    expect(sources['./IntegrityScene.tsx']).toContain('<Provenance kind="real">');
  });

  it('builds its one credential-shaped value from parts, contains no install script text and names no real registry', () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/npmjs|registry\.npm|pypi\.org|github\.com|curl |wget |postinstall|preinstall/i);
    }
    expect(sources['./MatrixScene.tsx']).toContain("fakeSecret('ci-', 'publish-'");
    expect(sources['./provenance.ts']).toContain("fakeSecret('demo-'");
  });
});

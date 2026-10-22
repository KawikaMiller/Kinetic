import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../core/crypto';
import { mulberry32, randInt } from '../../core/random';
import { nodeDigest, nodeHmac } from '../../core/testing/nodeCrypto';
import { satisfies } from '../../core/semver';
import { ancestorsOf, reachableFrom, type Adjacency } from './graph';
import { TARBALL_BYTES, bytesText, fakeTarball, flipByte, hashBytes, installOutcome } from './integrity';
import {
  CLASS_ORDER, DEFENCE_ORDER, LIMIT_NOTE, RULES, allDefenceSets, causesOf, defenceSet, verdictOf, type ClassId, type DefenceId,
} from './matrix';
import { KNOWN_NAMES, MAX_NAME_CHARS, WARN_DISTANCE, checkName, distance, nearest, parseName } from './names';
import { SCENARIO_ORDER, buildCase, passes, verify, type Attestation } from './provenance';
import { COMPROMISED_PACKAGE, COMPROMISED_VERSION, DEPENDENCIES, PACKAGE_NAMES, RELEASES, SERVICE_NAMES, SERVICES, WITHDRAWN_DAY, edges } from './registry';
import { affectedBy, cleanResolution, installAll, releaseStatus, resolveService } from './resolve';
import { holders, sbomOf } from './sbom';

describe('the shared semver module on the published npm rules', () => {
  it('follows the caret, tilde and pre-release rules from node-semver', () => {
    const inRange = (range: string, ok: string[], out: string[]) => {
      for (const v of ok) expect(satisfies(v, range), `${v} in ${range}`).toBe(true);
      for (const v of out) expect(satisfies(v, range), `${v} outside ${range}`).toBe(false);
    };
    inRange('^1.2.3', ['1.2.3', '1.9.9'], ['1.2.2', '2.0.0']);
    inRange('^0.2.3', ['0.2.3', '0.2.9'], ['0.2.2', '0.3.0']);
    inRange('^0.0.3', ['0.0.3'], ['0.0.2', '0.0.4']);
    inRange('~1.2.3', ['1.2.3', '1.2.9'], ['1.2.2', '1.3.0']);
    expect(satisfies('2.3.5-beta.1', '~2.3.0')).toBe(false);
    expect(satisfies('1.5.0-rc.1', '^1.4.0')).toBe(false);
  });
});

describe('graph queries', () => {
  /** A random DAG: node i may depend only on nodes with a larger index. */
  const randomDag = (seed: number): Adjacency => {
    const rnd = mulberry32(seed);
    const n = randInt(4, 14, rnd);
    return new Map(Array.from({ length: n }, (_, i) => [`n${i}`, Array.from({ length: n - i - 1 }, (_, k) => `n${i + 1 + k}`).filter(() => rnd() < 0.3)] as const));
  };

  /** Brute force by depth-first search from every node: can it reach the target? */
  const reaches = (adj: Adjacency, from: string, target: string, seen = new Set<string>()): boolean => {
    for (const next of adj.get(from) ?? []) {
      if (next === target) return true;
      if (!seen.has(next)) {
        seen.add(next);
        if (reaches(adj, next, target, seen)) return true;
      }
    }
    return false;
  };

  it('ancestors equal a brute-force search on 200 seeded random DAGs, for every target', () => {
    for (let seed = 0; seed < 200; seed++) {
      const adj = randomDag(seed);
      for (const target of adj.keys()) {
        const brute = [...adj.keys()].filter((n) => n !== target && reaches(adj, n, target)).sort();
        expect([...ancestorsOf(adj, target)].sort(), `seed ${seed} target ${target}`).toEqual(brute);
      }
    }
  });

  it('reachability equals a brute-force search on the same DAGs', () => {
    for (let seed = 0; seed < 200; seed++) {
      const adj = randomDag(seed);
      for (const from of adj.keys()) {
        const brute = [...adj.keys()].filter((n) => reaches(adj, from, n)).sort();
        expect([...reachableFrom(adj, [from])].sort()).toEqual(brute);
      }
    }
  });

  it('the invented tree: fifteen packages, three services, and the compromised package is reached by 8 packages and all 3 services', () => {
    expect(PACKAGE_NAMES).toHaveLength(15);
    expect(SERVICE_NAMES).toHaveLength(3);
    const adj: Adjacency = new Map([...Object.entries(SERVICES), ...Object.entries(DEPENDENCIES)].map(([k, v]) => [k, v.map((d) => d.name)]));
    expect([...ancestorsOf(adj, COMPROMISED_PACKAGE)].sort()).toEqual(
      ['api-core', 'batch-core', 'csv-lite', 'http-lite', 'json-tool', 'str-utils', 'svc-api', 'svc-batch', 'svc-web', 'url-bits', 'web-kit'].sort(),
    );
    expect(edges().every((e) => Object.keys(DEPENDENCIES).includes(e.to))).toBe(true);
  });

  it('uses no name of a real package', () => {
    const real = ['left-pad', 'lodash', 'react', 'express', 'event-stream', 'ua-parser-js', 'colors', 'faker', 'chalk', 'request', 'moment'];
    for (const r of real) expect(KNOWN_NAMES).not.toContain(r);
  });
});

describe('resolution, lockfile, pins and the cooldown', () => {
  const day2 = { day: 2, cooldown: 0 };

  it('hand-worked vector: svc-web on day 2 with ranges picks the newest release each range allows, tilde and pre-release rules included', () => {
    expect(Object.fromEntries(resolveService('svc-web', day2))).toEqual({
      'web-kit': '2.2.0', 'http-lite': '1.5.0', 'tiny-pad': '1.2.1', 'ui-icons': '2.1.0', 'url-bits': '1.1.4', 'str-utils': '2.3.4', 'svg-core': '3.0.2',
    });
  });

  it('a clean install before the release picks tiny-pad 1.2.0, and cooldown or withdrawal give the same', () => {
    expect(cleanResolution('svc-web').get('tiny-pad')).toBe('1.2.0');
    expect(resolveService('svc-web', { day: 2, cooldown: 3 }).get('tiny-pad')).toBe('1.2.0');
    expect(resolveService('svc-web', { day: WITHDRAWN_DAY, cooldown: 0 }).get('tiny-pad')).toBe('1.2.0');
  });

  it('releaseStatus agrees with resolution over every install day (0 to 8) and cooldown (0 to 7)', () => {
    for (let day = 0; day <= 8; day++) {
      for (let cooldown = 0; cooldown <= 7; cooldown++) {
        const picked = resolveService('svc-web', { day, cooldown }).get('tiny-pad') === COMPROMISED_VERSION;
        expect(releaseStatus({ day, cooldown }) === 'picked-up', `day ${day} cooldown ${cooldown}`).toBe(picked);
      }
    }
  });

  it('ranges: all 3 services and 9 packages are affected, equal to the dependents of the compromised package plus itself', () => {
    const a = affectedBy(installAll('ranges', 'before', day2));
    expect(a.services).toEqual(SERVICE_NAMES);
    expect(a.packages.sort()).toEqual(['api-core', 'batch-core', 'csv-lite', 'http-lite', 'json-tool', 'str-utils', 'tiny-pad', 'url-bits', 'web-kit']);
  });

  it('exact pins and a lockfile written before the release hold the old version; one written after freezes the bad one', () => {
    expect(affectedBy(installAll('exact', 'before', day2)).services).toEqual([]);
    expect(affectedBy(installAll('lockfile', 'before', day2)).services).toEqual([]);
    expect(affectedBy(installAll('lockfile', 'after', day2)).services).toEqual(SERVICE_NAMES);
    for (const s of SERVICE_NAMES) expect(installAll('exact', 'before', day2).get(s)).toEqual(cleanResolution(s));
  });

  it('every release the registry lists is a valid version, and only one is compromised', () => {
    const all = Object.values(RELEASES).flat();
    expect(all.filter((r) => r.compromised)).toHaveLength(1);
    expect(RELEASES[COMPROMISED_PACKAGE].find((r) => r.compromised)?.version).toBe(COMPROMISED_VERSION);
  });
});

describe('integrity with the real SHA-256', () => {
  it('matches the published vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes the fake tarball as Node does, and flipping any one of the 256 bytes changes the hash and fails the check', async () => {
    const genuine = fakeTarball();
    expect(genuine).toHaveLength(TARBALL_BYTES);
    expect(genuine.every((b) => b >= 0x20 && b < 0x80)).toBe(true);
    const recorded = await hashBytes(genuine);
    expect(recorded).toBe(nodeDigest('sha256', Uint8Array.from(genuine)));
    for (let i = 0; i < TARBALL_BYTES; i++) {
      const flipped = flipByte(genuine, i);
      const hash = await hashBytes(flipped);
      expect(hash, `byte ${i}`).not.toBe(recorded);
      expect(hash).toBe(nodeDigest('sha256', Uint8Array.from(flipped)));
      expect(installOutcome(recorded!, hash!, true).result).toBe('refused');
      expect(installOutcome(recorded!, hash!, false)).toEqual({ result: 'installed', changedInstalled: true });
    }
    expect(flipByte(flipByte(genuine, 17), 17)).toEqual(genuine);
    expect(installOutcome(recorded!, recorded!, true)).toEqual({ result: 'installed', changedInstalled: false });
    expect(bytesText(genuine)).toHaveLength(TARBALL_BYTES);
  }, 180_000);
});

describe('the defence matrix', () => {
  /** The oracle: per defence, the classes it blocks and the classes it limits. */
  const BLOCKS: Record<DefenceId, ClassId[]> = {
    'pin-lock': [], integrity: [], scopes: ['confusion'], 'scripts-off': ['install-script'], cooldown: [], provenance: [], sbom: [],
  };
  const LIMITS: Record<DefenceId, ClassId[]> = {
    'pin-lock': ['confusion', 'maintainer', 'install-script', 'build'],
    integrity: ['confusion'],
    scopes: [],
    'scripts-off': ['typosquat'],
    cooldown: ['typosquat', 'maintainer', 'install-script', 'build'],
    provenance: ['typosquat', 'maintainer', 'build', 'ci-credentials'],
    sbom: ['typosquat', 'maintainer', 'build', 'ci-credentials'],
  };

  it('matches the per-defence rule list over all 2^7 defence sets and 6 classes', () => {
    const sets = allDefenceSets();
    expect(sets).toHaveLength(128);
    for (const on of sets) {
      for (const cls of CLASS_ORDER) {
        const active = DEFENCE_ORDER.filter((d) => on.has(d));
        const expected = active.some((d) => BLOCKS[d].includes(cls)) ? 'blocked' : active.some((d) => LIMITS[d].includes(cls)) ? 'limited' : 'open';
        expect(verdictOf(cls, on), `${cls} with ${active.join('+')}`).toBe(expected);
      }
    }
  });

  it('the model rules and the oracle lists describe the same rules', () => {
    for (const d of DEFENCE_ORDER) {
      expect(new Set(CLASS_ORDER.filter((c) => RULES[c][d] === 'blocks'))).toEqual(new Set(BLOCKS[d]));
      expect(new Set(CLASS_ORDER.filter((c) => RULES[c][d] === 'limits'))).toEqual(new Set(LIMITS[d]));
    }
  });

  it('matches an oracle written per class from what each attack is, not from the rule table: only a source-level fix blocks a class, and a signature never does', () => {
    // Per class, the defences that can stop it outright, from the class's idea: dependency confusion is a resolution problem
    // (single-source scopes), a hostile install script is a run-at-install problem (scripts off). A look-alike name, a stolen
    // maintainer account, a tampered build and a leaked CI credential all produce artifacts that can carry a valid
    // attestation, so no switch in the list stops them outright.
    const CAN_BLOCK: Record<ClassId, DefenceId[]> = { typosquat: [], confusion: ['scopes'], maintainer: [], 'install-script': ['scripts-off'], build: [], 'ci-credentials': [] };
    for (const cls of CLASS_ORDER) {
      const blockers = DEFENCE_ORDER.filter((d) => RULES[cls][d] === 'blocks');
      expect(blockers, cls).toEqual(CAN_BLOCK[cls]);
    }
    for (const cls of ['typosquat', 'maintainer'] as const) expect(verdictOf(cls, defenceSet('provenance')), cls).toBe('limited');
  });

  it('every limiting rule has an on-screen explanation, so no limit is explained by a hover tooltip alone', () => {
    for (const cls of CLASS_ORDER) for (const d of DEFENCE_ORDER) if (RULES[cls][d] === 'limits') expect(LIMIT_NOTE[cls][d], `${cls}/${d}`).toBeTruthy();
  });

  it('is monotone: adding a defence never un-blocks or un-limits a class', () => {
    const rank = { open: 0, limited: 1, blocked: 2 } as const;
    for (const on of allDefenceSets()) {
      for (const extra of DEFENCE_ORDER.filter((d) => !on.has(d))) {
        const more = defenceSet(...on, extra);
        for (const cls of CLASS_ORDER) expect(rank[verdictOf(cls, more)]).toBeGreaterThanOrEqual(rank[verdictOf(cls, on)]);
      }
    }
  });

  it('with every defence on, a compromised build and leaked CI credentials are limited but never blocked, and each verdict has a cause', () => {
    const all = defenceSet(...DEFENCE_ORDER);
    expect(verdictOf('build', all)).toBe('limited');
    expect(verdictOf('ci-credentials', all)).toBe('limited');
    for (const cls of CLASS_ORDER) expect(causesOf(cls, all).length).toBeGreaterThan(0);
    for (const on of allDefenceSets()) expect(verdictOf('build', on)).not.toBe('blocked');
  });
});

describe('name similarity and the name field', () => {
  /** An independent Levenshtein distance, written as the textbook two-row recurrence. */
  const reference = (a: string, b: string): number => {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  };

  it('equals the reference distance on 300 seeded pairs of fictional names', () => {
    const rnd = mulberry32(28);
    const alphabet = 'abcdefgh-0123';
    const word = () => Array.from({ length: randInt(0, 12, rnd) }, () => alphabet[randInt(0, alphabet.length - 1, rnd)]).join('');
    for (let k = 0; k < 300; k++) {
      const a = word();
      const b = k % 3 === 0 ? a.slice(0, -1) + word().slice(0, 1) : word();
      expect(distance(a, b), `${a} / ${b}`).toBe(reference(a, b));
    }
    for (const name of KNOWN_NAMES) expect(distance(name, name)).toBe(0);
  });

  it('warns within 2 edits of a known name, not for an exact or an unrelated one', () => {
    expect(checkName('tiny-pas')).toMatchObject({ kind: 'warn', near: { name: 'tiny-pad', distance: 1 } });
    expect(checkName('tinypad')).toMatchObject({ kind: 'warn' });
    expect(checkName('tiny-pad')).toEqual({ kind: 'known' });
    expect(checkName('zzzzzzzzzz')).toEqual({ kind: 'unknown' });
    expect(checkName('')).toEqual({ kind: 'empty' });
    expect(nearest('tiny-pas', 1)[0].distance).toBeLessThanOrEqual(WARN_DISTANCE);
  });

  it('accepts a-z 0-9 - @ / up to 40 characters, renders as text and refuses the rest with a position', () => {
    expect(parseName('@scope/tiny-pad')).toEqual({ ok: true, value: '@scope/tiny-pad' });
    expect(parseName('a'.repeat(MAX_NAME_CHARS))).toMatchObject({ ok: true });
    expect(parseName('a'.repeat(MAX_NAME_CHARS + 1))).toEqual({ ok: false, error: 'Position 41: a package name is limited to 40 characters.' });
    expect(parseName('tiny pad')).toEqual({ ok: false, error: 'Position 5: only a-z, 0-9, -, @ and / are allowed in a package name here.' });
    expect(parseName('Tiny')).toMatchObject({ ok: false });
    expect(parseName('<b>x</b>')).toMatchObject({ ok: false });
  });
});

describe('build provenance and the SBOM', () => {
  const failed = async (id: (typeof SCENARIO_ORDER)[number]) => {
    const c = await buildCase(id);
    return (await verify(c!)).filter((x) => !x.ok).map((x) => x.id);
  };

  it('a genuine build passes and each other scenario fails exactly the checks it should', async () => {
    const genuine = await buildCase('genuine');
    expect(passes(await verify(genuine!))).toBe(true);
    expect(await failed('repackaged')).toEqual(['artifact']);
    expect(await failed('wrong-commit')).toEqual(['commit']);
    expect(await failed('other-builder')).toEqual(['builder', 'signature']);
    const none = await buildCase('none');
    expect(await verify(none!)).toEqual([{ id: 'present', label: 'an attestation came with it', ok: false }]);
  });

  it('a tampered statement fails the signature check even when every field looks right', async () => {
    const c = (await buildCase('genuine'))!;
    const tampered = { ...c, attestation: { ...c.attestation!, commit: c.attestation!.commit.replace(/.$/, '0') } as Attestation };
    expect((await verify(tampered)).filter((x) => !x.ok).map((x) => x.id)).toEqual(expect.arrayContaining(['signature']));
  });

  it('the attested hash and the HMAC are the real values Node computes', async () => {
    const c = (await buildCase('genuine'))!;
    expect(c.attestation!.artifactHash).toBe(nodeDigest('sha256', Uint8Array.from(c.artifact)));
    const body = `${c.attestation!.artifactHash}|${c.attestation!.builder}|${c.attestation!.commit}`;
    expect(c.attestation!.signature).toBe(nodeHmac('sha256', 'demo-builder-1-signing-key', body));
  });

  it('the SBOM lists every component of each install, and the query finds the three services that run tiny-pad@1.2.1', () => {
    const boms = sbomOf(installAll('ranges', 'before', { day: 2, cooldown: 0 }));
    expect(boms.map((b) => b.components.length)).toEqual([7, 8, 8]);
    const h = holders(boms, COMPROMISED_PACKAGE);
    expect(h).toEqual(SERVICE_NAMES.map((service) => ({ service, version: COMPROMISED_VERSION, compromised: true })));
    expect(holders(boms, 'svg-core')).toHaveLength(1);
    expect(holders(boms, 'not-a-package')).toEqual([]);
  });
});

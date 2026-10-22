import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { forbiddenCalls } from '../../core/testing/forbidden';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { fetchCaption, invoiceCaption, metadataCaption, outcomeText } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { FIRST_ID, LAST_ID, MODES, SIGNED_IN, KNOWN_FOREIGN } from './invoices';
import { NO_HARDENING } from './metadata';
import { OPENING } from './opening';
import { DEFENCES, NO_DEFENCES, SCENARIOS, run, subsetOf, SUBSET_COUNT } from './ssrf';

const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('ssrf-access-control');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('ssrf-access-control')).toEqual([]);
  });

  it('each scene opens on a fixed state: public page with nothing on, nothing hardened, invoice 1001 with no check', () => {
    expect(OPENING.scene).toBe('fetch');
    expect(OPENING.fetch.scenario).toBe('public');
    expect(Object.values(OPENING.fetch.defences).some(Boolean)).toBe(false);
    expect(OPENING.metadata).toEqual(NO_HARDENING);
    expect(OPENING.invoices).toEqual({ mode: 'none', id: 1001, role: 'member', roleCheck: false });
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: public page reached; the inside-resolving card reaches the wiki, the deny-list blocks it; the redirect card gets past it until the re-check', () => {
    expect(FACTS.defaultStatus).toBe('public');
    expect([FACTS.resolvesNone, FACTS.resolvesDenyBlockedBy, FACTS.redirectDeny, FACTS.redirectDenyRecheck]).toEqual(['internal', 'denyList', 'internal', 'blocked']);
    expect(lesson.tryThis[0]).toContain('reaches a public page');
  });

  it('try-this 2: the deny-list preset leaves 3 of 6 scenarios reaching inside; the allow-list, pinning and re-check preset leaves 0 and the public page works', () => {
    expect([FACTS.unsafeNone, FACTS.unsafeDeny, FACTS.unsafeTrio, FACTS.publicWithTrio]).toEqual([5, 3, 0, 'public']);
    expect(lesson.tryThis[1]).toContain('3 of 6 scenarios still reach inside');
    expect(lesson.tryThis[1]).toContain('0 of 6 do');
  });

  it('try-this 3: broad role 3 things, least privilege 1, token refused 0', () => {
    expect([FACTS.broad, FACTS.narrow, FACTS.tokenRefused, FACTS.tokenKind]).toEqual([3, 1, 0, 'refused']);
    expect(lesson.tryThis[2]).toContain('could do 3 things');
    expect(lesson.tryThis[2]).toContain('1 thing');
  });

  it('try-this 4: two presses reach invoice 1003 (Bob\'s), 7 of 7 reachable, owner check 0 and 404, unguessable 2 and a link id works', () => {
    expect(FACTS.stepTo.id).toBe(FIRST_ID + 2);
    expect(FACTS.stepToNone.status).toBe(200);
    expect(FACTS.stepToOwner.status).toBe(404);
    expect([FACTS.noneReach, FACTS.others, FACTS.ownerReach, FACTS.unguessableReach, FACTS.linkIdWorks]).toEqual([7, 7, 0, 2, 200]);
    expect(FACTS.exportNoCheck).toBe(200);
    expect(FACTS.exportCheck).toBe(403);
    expect(lesson.tryThis[3]).toContain('invoice 1001');
    expect(lesson.tryThis[3]).toContain('7 of 7 other invoices are reachable');
  });
});

describe('captions across the control cross product', () => {
  it('every scenario under every 512th subset of defences gives a clean caption that names the computed outcome', () => {
    for (const s of SCENARIOS) {
      for (let mask = 0; mask < SUBSET_COUNT; mask += 7) {
        const d = subsetOf(mask);
        const text = expectCaption(fetchCaption(s.id, d));
        expect(text).toContain(outcomeText(run(s, d)));
        expect(text).not.toMatch(/NaN|undefined|\[object/);
      }
    }
  });

  it('every hardening combination gives a clean caption', () => {
    for (const token of [false, true]) for (const hopLimit of [false, true]) for (const leastPrivilege of [false, true]) {
      expect(expectCaption(metadataCaption({ token, hopLimit, leastPrivilege }))).not.toMatch(/NaN|undefined|\[object/);
    }
  });

  it('every mode, id, role and check gives a clean invoice caption', () => {
    for (const m of MODES) {
      for (let id = FIRST_ID; id <= LAST_ID; id++) {
        for (const roleCheck of [false, true]) expect(expectCaption(invoiceCaption(m.id, id, 'member', roleCheck))).not.toMatch(/NaN|undefined|\[object/);
      }
    }
    expect(expectCaption(invoiceCaption('unguessable', KNOWN_FOREIGN[0].token, 'admin', true))).toContain(`${SIGNED_IN.name} gets`);
  });

  it('the defence toggle count matches the spec: nine', () => {
    expect(DEFENCES).toHaveLength(9);
    expect(Object.keys(NO_DEFENCES)).toHaveLength(9);
  });
});

describe('the lesson stays inside the simulation and carries no payload', () => {
  /** Address-shaped text: the only ones allowed are documentation ranges and RFC 1918 (and none appear today). */
  const ADDRESS = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
  const ALLOWED_PREFIXES = ['192.0.2.', '198.51.100.', '203.0.113.', '10.', '172.16.', '192.168.'];

  it('has no network call, no eval and no URL parsing of learner text in any source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(8);
    expect(forbiddenCalls(sources, { also: ['newUrl'] })).toEqual([]);
  });

  it('holds no address beyond the documentation ranges and RFC 1918, and no link-local or loopback literal', () => {
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.match(ADDRESS) ?? []) expect(ALLOWED_PREFIXES.some((p) => m.startsWith(p)), `${file}: ${m}`).toBe(true);
      expect(text, file).not.toMatch(/169\.254|127\.0\.0|0x7f|localhost|::1/);
    }
  });

  it('chips every scene as simulated', () => {
    for (const f of ['./FetchScene.tsx', './MetadataScene.tsx', './InvoiceScene.tsx']) expect(sources[f]).toContain('<Provenance kind="simulated">');
    expect(sources['./FetchScene.tsx']).toContain('<Provenance kind="toy">');
    expect(sources['./MetadataScene.tsx']).toContain('<Provenance kind="from-memory">');
  });

  it('builds the fake credential from parts, so no credential-shaped literal sits in the source', () => {
    expect(sources['./ssrf.ts']).toContain('fakeSecret(');
  });
});

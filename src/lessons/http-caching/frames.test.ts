import { describe, expect, it } from 'vitest';
import { bytes } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { messageCaption, requestFrames, verdict } from './frames';
import { BLANK, HEAD_BYTES, PRESETS, USERS, replay, type EtagMode, type Event, type Policy, type Resource, type VaryHeader } from './model';

const FLAGS = ['public', 'private', 'noStore', 'noCache', 'mustRevalidate', 'immutable'] as const;
const ETAGS: EtagMode[] = ['none', 'strong', 'weak'];
const VARIES: VaryHeader[][] = [[], ['accept-encoding'], ['cookie'], ['accept-encoding', 'cookie']];

/** Every flag subset × ETag mode × Last-Modified × Vary, with max-age 60 and stale-while-revalidate 120. */
function* everyPolicy(): Generator<Policy> {
  for (let mask = 0; mask < 1 << FLAGS.length; mask++) {
    for (const etag of ETAGS) {
      for (const lastModified of [false, true]) {
        for (const vary of VARIES) {
          const p: Policy = { ...BLANK, maxAge: 60, swr: 120, etag, lastModified, vary };
          FLAGS.forEach((f, i) => { p[f] = (mask & (1 << i)) !== 0; });
          yield p;
        }
      }
    }
  }
}

const SCRIPT: Event[] = [
  { kind: 'request', t: 0, user: 'A', reload: false },
  { kind: 'request', t: 30, user: 'B', reload: false },
  { kind: 'request', t: 50, user: 'A', reload: true },
  { kind: 'request', t: 100, user: 'A', reload: false },
  { kind: 'deploy', t: 150 },
  { kind: 'request', t: 400, user: 'B', reload: false },
  { kind: 'request', t: 401, user: 'A', reload: false },
];
const PER_USER: Resource = { path: '/me', body: 9_000, perUser: true };

describe('model invariants over every composed policy (1,536 combinations, per-user resource)', () => {
  it('holds for each request of the script', () => {
    let n = 0;
    for (const p of everyPolicy()) {
      const { outcomes, world } = replay(p, PER_USER, SCRIPT);
      n++;
      for (const o of outcomes) {
        // Bytes: a 304 never carries a body.
        expect(o.originBytes).toBe(o.originStatuses.reduce((s, st) => s + HEAD_BYTES + (st === 200 ? PER_USER.body : 0), 0));
        if (o.kind === 'fresh' && o.answeredBy === 'browser') expect([o.originBytes, o.clientBytes]).toEqual([0, 0]);
        // A leak needs a shared cache that stored a per-user page: never with private, no-store or Vary: Cookie.
        if (p.private || p.noStore || p.vary.includes('cookie')) expect(o.leak || o.sharedStoredPersonal).toBe(false);
        if (o.leak) expect(o.messages.some((m) => m.tone === 'bad')).toBe(true);
        else expect(o.messages.some((m) => m.tone === 'bad')).toBe(false);
        if (p.noStore) expect(o.kind).toBe('not-stored');
        if (p.noCache) expect(['fresh', 'stale']).not.toContain(o.kind);
        // A reload is only answered from a fresh browser copy when immutable says so.
        if (o.reload && o.answeredBy === 'browser') expect(p.immutable && o.kind === 'fresh').toBe(true);
      }
      if (p.noStore) expect([world.browsers.A, world.browsers.B, world.shared.size]).toEqual([null, null, 0]);
    }
    expect(n).toBe(1536);
  });
});

describe('captions follow the outcome they describe', () => {
  it('every message caption and verdict, for every policy, tells the model\'s story', () => {
    for (const p of everyPolicy()) {
      for (const o of replay(p, PER_USER, SCRIPT).outcomes) {
        for (const m of o.messages) {
          const text = expectCaption(messageCaption(m, o));
          if (m.tone === 'info') expect(text).toContain(m.label);
          if (m.tone === 'violet') expect(text).toContain('304 Not Modified');
          if (m.tone === 'bad') expect(text).toContain(`hands ${USERS[o.user].name} ${USERS[o.owner!].name}'s page`);
          if (m.tone === 'bad') expect(text).toContain('Many CDNs add safeguards');
          if (m.background && m.from !== m.to) expect(text).toContain('background');
        }
        const v = expectCaption(verdict(o, PER_USER.body));
        const word = { fresh: 'Fresh hit', stale: 'Stale served', 'revalidated-304': 'Revalidated: 304', 'revalidated-200': 'it had changed', miss: 'Miss', 'not-stored': 'no-store' }[o.kind];
        expect(v).toContain(word);
        expect(v).toContain(o.originBytes === 0 ? 'Nothing reached the origin.' : `${bytes(o.originBytes, { base: 1000 })} crossed the origin link.`);
        expect(v.includes('was shown')).toBe(o.leak);
      }
    }
  });

  it('frames: the request, one per message, then the verdict on the last message', () => {
    const { policy, resource } = PRESETS.html;
    const [, second] = replay(policy, resource, SCRIPT.slice(0, 2)).outcomes;
    const frames = requestFrames(second, 'intro', resource.body);
    expect(frames.map((f) => f.step)).toEqual([-1, ...second.messages.map((_, i) => i), second.messages.length - 1]);
    expect(expectCaption(frames[0].say)).toBe('Ben requests the page at t = 30 s.');
    expect(requestFrames(null, 'intro', 1)).toEqual([{ step: -1, say: 'intro' }]);
  });
});

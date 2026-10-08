import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { REASON, introFor, runFrames, statusTone } from './frames';
import { DEFAULT_CONFIG, PRESETS, presetRequests, runRequests, type GatewayConfig } from './model';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n).replace(/\s+/g, ' ');
const STATUS_RE = /\b(200|401|404|429|502|504) (?:OK|[A-Z][a-z]+)/g;

describe('every caption is true, for every preset × auth × spoofed XFF × mTLS', () => {
  for (const p of PRESETS)
    for (const authAtEdge of [true, false])
      for (const spoof of [false, true])
        for (const mtls of [false, true])
          it(`${p.id}, edge auth ${authAtEdge}, spoof ${spoof}, mtls ${mtls}`, () => {
            const cfg: GatewayConfig = { ...DEFAULT_CONFIG, authAtEdge, health: { ...DEFAULT_CONFIG.health, ...p.health } };
            const results = runRequests(presetRequests(p, spoof), cfg);
            const frames = runFrames(results, cfg, mtls, introFor(p.label, results.length));
            expect(frames).toHaveLength(1 + results.reduce((n, r) => n + r.out.ran.length + 1, 0));
            for (const f of frames.slice(1)) {
              const { out } = results[f.k];
              const say = text(f.say);
              const statuses = [...say.matchAll(STATUS_RE)].map((m) => Number(m[1]));
              // A status is named only where the response is decided, and it is always the real one.
              for (const s of statuses) expect(s).toBe(out.status);
              if (f.stage === out.stoppedAt || f.stage === null) expect(statuses).toEqual([out.status]);
              else expect(statuses).toEqual([]);
              if (f.stage === 'tls') expect(say).toContain(mtls ? 'mTLS' : 'plain HTTP');
              if (f.stage === 'route' && out.route) expect(say).toContain(`goes to ${out.route.service}`);
              if (f.stage === 'headers') {
                expect(say).toContain(out.forwarded!.find(([h]) => h === 'X-Forwarded-For')![1]);
                expect(say.includes('only that last entry can be trusted')).toBe(spoof);
              }
              if (f.stage === null) expect(say).toContain(out.fromService ? 'came from the service' : 'gateway answered it itself');
              if (f.stage === 'forward' && out.status === 502) {
                expect(say).toContain(`${out.attempts} attempts`);
                expect(say).toContain('safe for any method');
              }
              if (f.stage === 'auth' && authAtEdge && out.route?.auth && out.stoppedAt !== 'auth')
                expect(say).toContain(mtls ? 'with mTLS inside, only the gateway can reach them' : 'rests on the network being isolated');
              expect(say).not.toMatch(/\b1 whole tokens\b/);
            }
          });

  it('the status colours follow http-basics: 2xx green, 4xx orange, 5xx red', () => {
    expect([200, 401, 404, 429, 502, 504].map(statusTone)).toEqual(['ok', 'orange', 'orange', 'orange', 'bad', 'bad']);
    expect(Object.keys(REASON).map(Number).sort()).toEqual([200, 401, 404, 429, 502, 504]);
  });
});

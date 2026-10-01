import { describe, expect, it } from 'vitest';
import { RETRY_DELAYS, script } from './frames';
import { backoff, ENDPOINTS, isClient, USER_V1, USER_V2, type Scenario } from './model';

const SCENARIOS: Scenario[] = ['request', 'scale', 'down', 'breaking'];
const last = (s: Scenario) => script(s).at(-1)!;

describe('every scenario', () => {
  it.each(SCENARIOS)('%s has a caption on every frame and counts consistently', (s) => {
    const frames = script(s);
    let sent = 0;
    let errors = 0;
    for (const f of frames) {
      expect(f.say).toBeTruthy();
      if (f.msg?.kind === 'req' && isClient(f.msg.from)) sent++;
      if (f.msg?.fail || f.msg?.kind === 'bad') errors++;
      expect([f.sent, f.errors]).toEqual([sent, errors]);
    }
  });
});

describe('a request', () => {
  it('three different clients call the same endpoint and get the same JSON', () => {
    const frames = script('request');
    const calls = frames.filter((f) => f.msg?.kind === 'req').map((f) => f.msg!);
    expect(calls.map((c) => c.from)).toEqual(['browser', 'mobile', 'cli']);
    expect(new Set(calls.map((c) => c.label.replace(/^curl /, 'GET ')))).toEqual(new Set(['GET /users/42']));
    expect(frames.filter((f) => f.msg?.kind === 'ok').every((f) => f.json === USER_V1)).toBe(true);
    expect(last('request').sent).toBe(3);
  });

  it('only the server talks to the database', () => {
    for (const s of SCENARIOS) {
      for (const f of script(s)) {
        if (f.msg?.from === 'db' || f.msg?.to === 'db') expect(f.msg.kind).toBe('db');
        if (f.msg && isClient(f.msg.from)) expect(f.msg.to).not.toBe('db');
      }
    }
  });
});

describe('scale out', () => {
  it('counts what clients send, not the load balancer’s forwards', () => {
    expect(last('scale').sent).toBe(2);
  });

  it('two requests land on different servers and get the same answer (stateless)', () => {
    const frames = script('scale');
    const forwards = frames.filter((f) => f.msg?.from === 'lb').map((f) => f.msg!.to);
    expect(forwards).toHaveLength(2);
    expect(forwards[0]).not.toBe(forwards[1]);
    const answers = frames.filter((f) => f.msg?.kind === 'ok').map((f) => f.json);
    expect(new Set(answers).size).toBe(1);
  });
});

describe('server down', () => {
  it('backs off exponentially: each wait doubles', () => {
    expect(backoff(4)).toEqual([2, 4, 8, 16]);
    const labels = script('down').filter((f) => f.msg?.label.startsWith('retry')).map((f) => f.msg!.label);
    expect(labels).toEqual(RETRY_DELAYS.map((d) => `retry (after ${d} s)`));
  });

  it('requests sent while the server is down fail; the one after it recovers succeeds', () => {
    const frames = script('down');
    for (const f of frames) if (f.msg?.kind === 'req') expect(Boolean(f.msg.fail)).toBe(f.down);
    expect(last('down').errors).toBe(2);
    expect(frames.at(-2)!.msg?.kind).toBe('ok');
  });
});

describe('breaking change', () => {
  it('renaming a field breaks the old app; the fix doesn’t require the old app to change', () => {
    const frames = script('breaking');
    const mobileCalls = frames.filter((f) => f.msg?.from === 'mobile' && f.msg.kind === 'req').map((f) => f.msg!.label);
    // the old app keeps sending exactly the request it was built with
    expect(new Set(mobileCalls)).toEqual(new Set(['GET /users/42']));
    const broke = frames.find((f) => f.msg?.kind === 'bad')!;
    expect(broke.json).toBe(USER_V2);
    expect(broke.screens.mobile).toEqual({ text: 'Hello, undefined', tone: 'bad' });
    expect(last('breaking').screens.mobile.tone).toBe('ok');
  });

  it('after the fix, the old path still serves the old shape and the new shape lives at /v2', () => {
    const fixed = script('breaking').filter((f) => f.version === 'both');
    const webCall = fixed.find((f) => f.msg?.from === 'browser' && f.msg.kind === 'req')!.msg!.label;
    expect(webCall).toBe('GET /v2/users/42');
    expect(ENDPOINTS.both.some((e) => e.startsWith('GET /users/{id} → { id, name'))).toBe(true);
    expect(ENDPOINTS.both.some((e) => e.startsWith('GET /v2/users/{id} → { id, fullName'))).toBe(true);
    const mobileAnswer = fixed.find((f) => f.msg?.to === 'mobile' && f.msg.kind === 'ok')!;
    expect(mobileAnswer.json).toBe(USER_V1);
  });
});

import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { b64url, enc, hmac as coreHmac } from '../../core/crypto';
import { flowFrames, scaleFrames, TAMPER_STORY } from './frames';
import {
  ALG, GUESSED_SECRET, HEADER, LESSON_NOW, LIFETIME_MIN, PAYLOAD, SERVER_SECRET, b64urlJson, clampSub, compact,
  constantTimeEqual, decodePart, forge, signJwt, tamperStory, verifyJwt, type Jwt, type Resign,
} from './jwt';
import jwtSource from './jwt.ts?raw';

// Token-shaped fixtures are joined from pieces so this file never holds one in a single literal.
const join = (...parts: string[]) => parts.join('');
/** base64url, written out by hand rather than through the lesson's helpers. */
const toB64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
/** Independent reference: HMAC-SHA256 straight from Web Crypto, bypassing the lesson's wrappers. */
async function refHs256(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toB64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))));
}

const genuine = async () => (await signJwt(PAYLOAD, SERVER_SECRET))!;

describe('HS256, against references', () => {
  it('matches RFC 7515 Appendix A.1 (HMAC-SHA256 over the example signing input)', async () => {
    const keyB64 = join('AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T', '-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow');
    const key = fromB64url(keyB64);
    const input = join(
      'ey', 'J0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9', '.',
      'ey', 'Jpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ',
    );
    const sig = await coreHmac(key, enc.encode(input), { hash: 'SHA-256', out: 'bytes' });
    expect(b64url(sig!)).toBe(join('dBjftJeZ4CVP-mB92K27uhbUJU1p', '1r_wW1gFWFOEjXk'));
  });

  it("signs the lesson's token exactly as raw Web Crypto does, in RFC 7519 compact form", async () => {
    const t = await genuine();
    expect(decodePart(t.header)).toEqual(HEADER);
    expect(decodePart(t.payload)).toEqual(PAYLOAD);
    expect(t.signature).toBe(await refHs256(SERVER_SECRET, `${t.header}.${t.payload}`));
    // base64url, no padding: 32 bytes -> 43 characters
    expect(t.signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(compact(t).split('.')).toHaveLength(3);
  });
});

describe('verify', () => {
  it('accepts the genuine token at the lesson clock', async () => {
    expect(await verifyJwt(await genuine())).toMatchObject({ valid: true, reason: 'ok' });
  });

  it('rejects any one-character change to the payload or signature', async () => {
    const t = await genuine();
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    for (let i = 0; i < t.payload.length; i += 7) {
      expect((await verifyJwt({ ...t, payload: flip(t.payload, i) })).valid).toBe(false);
    }
    for (let i = 0; i < t.signature.length; i += 5) {
      expect(await verifyJwt({ ...t, signature: flip(t.signature, i) })).toMatchObject({ valid: false, reason: 'bad-signature' });
    }
  });

  it('rejects a token once exp has passed, and accepts it until then', async () => {
    const t = await genuine();
    expect((await verifyJwt(t, SERVER_SECRET, PAYLOAD.exp - 1)).valid).toBe(true);
    expect(await verifyJwt(t, SERVER_SECRET, PAYLOAD.exp)).toMatchObject({ valid: false, reason: 'expired' });
    expect(LESSON_NOW).toBeLessThan(PAYLOAD.exp);
  });

  it('only accepts the pinned algorithm, even when the signature is right', async () => {
    const header = b64urlJson({ ...HEADER, alg: 'HS512' });
    const payload = b64urlJson(PAYLOAD);
    const t: Jwt = { header, payload, signature: await refHs256(SERVER_SECRET, `${header}.${payload}`) };
    expect(await verifyJwt(t)).toMatchObject({ valid: false, reason: 'wrong-alg' });
    expect(ALG).toBe('HS256');
  });

  it('rejects a header that is not base64url JSON', async () => {
    const t = await genuine();
    expect(await verifyJwt({ ...t, header: '%%%' })).toMatchObject({ valid: false, reason: 'malformed' });
  });

  it('compares signatures by content only', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('the Forge lane', () => {
  const RESIGNS: Resign[] = ['keep', 'guess', 'leaked'];

  it('every edit x signing choice gets the verdict and the story the server actually gives', async () => {
    for (const sub of ['42', '7', '']) {
      for (const role of ['user', 'admin']) {
        for (const resign of RESIGNS) {
          const r = (await forge(sub, role, resign))!;
          const edited = sub !== PAYLOAD.sub || role !== PAYLOAD.role;
          expect(r.edited).toBe(edited);
          // only the real key can produce a signature the server accepts, and keeping the old one only works unedited
          expect(r.valid).toBe(resign === 'leaked' || (resign === 'keep' && !edited));
          const story = tamperStory(r, resign);
          expect(TAMPER_STORY[story]).toBeDefined();
          if (story === 'forged-accepted') expect(edited && resign === 'leaked').toBe(true);
          if (story === 'resigned-same') {
            expect(r.jwt.signature).toBe((await genuine()).signature);
            expect(text(TAMPER_STORY[story])).toContain('exactly the same signature');
          }
          if (story === 'genuine') expect(text(TAMPER_STORY[story])).toContain('genuine token');
        }
      }
    }
  });

  it('the guessed key really differs from the server key', () => {
    expect(GUESSED_SECRET).not.toBe(SERVER_SECRET);
  });

  it('trims a typed subject by characters, never splitting an emoji', () => {
    expect(clampSub('abcdefgh')).toBe('abcdef');
    expect(clampSub('😀😀😀😀😀😀😀')).toBe('😀😀😀😀😀😀');
    expect(clampSub('')).toBe('');
    expect(clampSub('<b>x</b>')).toBe('<b>x</');
  });
});

describe('the scripted lanes', () => {
  it('every frame has its own caption', () => {
    for (const frames of [flowFrames('session'), flowFrames('jwt'), scaleFrames()]) {
      for (const f of frames) expect(text(f.say).length).toBeGreaterThan(0);
    }
  });

  it('sessions count a store lookup per authenticated request, and the replay after logout is refused', () => {
    const frames = flowFrames('session');
    expect(frames.at(-1)!.lookups).toBe(2);
    const replay = frames.find((f) => f.attacker && f.verdict === 'bad')!;
    expect(replay.rows).toEqual([]);
    expect(replay.msg?.label).toContain('401');
  });

  it("the JWT replay after logout is accepted because the token really still verifies at the lesson's clock", async () => {
    const frames = flowFrames('jwt');
    const replay = frames.find((f) => f.attacker && f.verdict === 'bad')!;
    expect(replay.msg?.label).toContain('200');
    expect((await verifyJwt(await genuine())).valid).toBe(true);
    expect(text(frames.at(-1)!.say)).toContain(`${LIFETIME_MIN} min, like this one`);
    expect(LIFETIME_MIN).toBe(15);
  });
});

describe('payload-free source', () => {
  it('holds no demo key as a single literal', () => {
    expect(jwtSource).not.toContain(SERVER_SECRET);
    expect(jwtSource).not.toContain(GUESSED_SECRET);
  });
});

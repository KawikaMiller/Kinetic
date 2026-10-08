import { describe, expect, it } from 'vitest';
import { BODY, SECRET, SIGNED_AT, TOLERANCE_S, inspect, sign, signedDelivery, signedPayload, tamper, type Received } from './signature';

// Computed outside this codebase (Python's hmac over `1760000000.<body>` with SECRET), then pinned here.
const VECTOR = '912d4b899272275d71d1a6e26e6b25ce339e4bca0bd7578fae97a7117068e928';

const delivery = async (): Promise<Received> => (await signedDelivery())!;
const at = (ageS: number) => SIGNED_AT + ageS;

/** Raw WebCrypto, written out here rather than through core/crypto. */
async function subtleHmac(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('the signature is real HMAC-SHA-256 over timestamp.body', () => {
  it('matches the fixed vector', async () => {
    expect(await sign(SECRET, String(SIGNED_AT), BODY)).toBe(VECTOR);
  });
  it('matches Node\'s own HMAC for many timestamps and bodies', async () => {
    for (const ts of ['0', '1', '1760000000', '999999999999'])
      for (const body of ['', '{}', BODY, 'ünïcode 🙂', 'a.b.c'])
        expect(await sign(SECRET, ts, body)).toBe(await subtleHmac(SECRET, `${ts}.${body}`));
  });
  it('signs the timestamp, a dot, then the body', () => {
    expect(signedPayload('17', 'x')).toBe('17.x');
  });
  it('the demo secret is assembled at runtime and says it is fake', () => {
    expect(SECRET).toContain('demo');
    expect(SECRET).toContain('not-a-real');
  });
});

describe('verification', () => {
  it('accepts the untouched delivery', async () => {
    const r = await inspect(SECRET, await delivery(), at(0));
    expect(r?.verdict).toEqual({ ok: true });
    expect(r?.differing).toBe(0);
  });
  it('any one-byte change to the body fails, at every position', async () => {
    const d = await delivery();
    for (let i = 0; i < BODY.length; i++) {
      const edited = BODY.slice(0, i) + String.fromCharCode(BODY.charCodeAt(i) ^ 1) + BODY.slice(i + 1);
      const r = await inspect(SECRET, { ...d, body: edited }, at(0));
      expect(r?.verdict, `byte ${i}`).toEqual({ ok: false, reason: 'bad-signature' });
    }
  });
  it('the toggle\'s edit (2500 → 2501) fails, and most hex digits change', async () => {
    const r = await inspect(SECRET, { ...(await delivery()), body: tamper(BODY) }, at(0));
    expect(tamper(BODY)).not.toBe(BODY);
    expect(tamper(BODY).length).toBe(BODY.length);
    expect(r?.verdict).toEqual({ ok: false, reason: 'bad-signature' });
    expect(r!.differing!).toBeGreaterThan(40);
  });
  it('a changed timestamp fails too: it is inside the signature', async () => {
    const d = await delivery();
    expect((await inspect(SECRET, { ...d, timestampHeader: String(SIGNED_AT + 1) }, at(0)))?.verdict).toEqual({ ok: false, reason: 'bad-signature' });
  });
  it('the wrong secret fails', async () => {
    const d = (await signedDelivery(SECRET + 'x'))!;
    expect((await inspect(SECRET, d, at(0)))?.verdict).toEqual({ ok: false, reason: 'bad-signature' });
  });
  it('uppercase hex is the same signature', async () => {
    const d = await delivery();
    expect((await inspect(SECRET, { ...d, signatureHeader: d.signatureHeader.toUpperCase().replace('V1=', 'v1=') }, at(0)))?.verdict.ok).toBe(true);
  });
});

describe('timestamp tolerance, at the boundary', () => {
  it(`${TOLERANCE_S} s old is accepted, one second more is stale`, async () => {
    const d = await delivery();
    expect((await inspect(SECRET, d, at(TOLERANCE_S)))?.verdict).toEqual({ ok: true });
    expect((await inspect(SECRET, d, at(TOLERANCE_S + 1)))?.verdict).toEqual({ ok: false, reason: 'stale' });
    expect((await inspect(SECRET, d, at(10 * 60)))?.ageS).toBe(600);
  });
  it('a timestamp from the future by more than the tolerance is refused too', async () => {
    const d = await delivery();
    expect((await inspect(SECRET, d, at(-TOLERANCE_S)))?.verdict).toEqual({ ok: true });
    expect((await inspect(SECRET, d, at(-TOLERANCE_S - 1)))?.verdict).toEqual({ ok: false, reason: 'future' });
  });
  it('a replay with an old timestamp and a valid signature is stale, not a signature failure', async () => {
    const r = await inspect(SECRET, await delivery(), at(3600));
    expect(r?.verdict).toEqual({ ok: false, reason: 'stale' });
    expect(r?.differing).toBe(0);
  });
  it('a bad signature is reported before staleness (the timestamp is only trusted once authenticated)', async () => {
    const r = await inspect(SECRET, { ...(await delivery()), body: tamper(BODY) }, at(3600));
    expect(r?.verdict).toEqual({ ok: false, reason: 'bad-signature' });
  });
});

describe('hostile headers are refused as malformed', () => {
  const cases: [string, string, string][] = [
    ['empty timestamp', '', 'v1=' + VECTOR],
    ['spaces', ' 1760000000', 'v1=' + VECTOR],
    ['negative', '-1', 'v1=' + VECTOR],
    ['exponent', '1e9', 'v1=' + VECTOR],
    ['23 digits', '12345678901234567890123', 'v1=' + VECTOR],
    ['emoji', '🙂', 'v1=' + VECTOR],
    ['markup', '<b>1</b>', 'v1=' + VECTOR],
    ['no prefix', '1760000000', VECTOR],
    ['short signature', '1760000000', 'v1=abc'],
    ['non-hex signature', '1760000000', 'v1=' + 'z'.repeat(64)],
    ['two signatures with a gap', '1760000000', `v1=${VECTOR},,v1=${VECTOR}`],
    ['empty signature', '1760000000', ''],
  ];
  it.each(cases)('%s', async (_n, timestampHeader, signatureHeader) => {
    const r = await inspect(SECRET, { timestampHeader, signatureHeader, body: BODY }, at(0));
    expect(r?.verdict).toEqual({ ok: false, reason: 'malformed' });
    expect(r?.expected).toBeNull();
  });
});

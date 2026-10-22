import { describe, expect, it } from 'vitest';
import { aesGcmDecrypt, aesGcmEncrypt, hexToBytes, hkdf, toHex } from '../../core/crypto';
import { mulberry32 } from '../../core/random';
import { nodeAesGcmOpen, nodeAesGcmSeal, nodeDigest, nodeEcdhPublic, nodeEcdhSecret, nodeHkdf, nodeHmac } from '../../core/testing/nodeCrypto';
import { CLONE_SALT, analyse, buildRun, compareModes, DEFAULT_SEED, parsePattern } from './model';
import { chainStep, demoChainKey, headerBytes, openWith, realAlgebra, type Bytes } from './realAlg';
import { runConversation, type Party, type RatchetMode } from './ratchet';
import { dependsOnFreshKey, reading, symbolicRun, type SymAlgebra } from './symAlg';
import { cloneReadable, fixedKeyRun, fixedOpens, flipSite, tamper } from './thief';

/* ── a second implementation of the same protocol straight on node:crypto (test-local) ───────────────────────
 * What is independent: every primitive (HMAC, HKDF, ECDH, SHA-256, AES-GCM come from node:crypto), the key-choice rule
 * (retyped below, not imported), the UTF-8 encoding, the byte layout of the header and the demo texts. What is NOT
 * independent: the protocol shape itself (info strings, 0x01 / 0x02 constants, the order of the DH steps), which the
 * same author wrote twice. So this checks the lesson's implementation of that shape, not the shape against Signal's
 * specification. The only lesson imports left are the functions under test (realAlgebra, headerBytes, the model run). */

const utf8 = (text: string): Bytes => new Uint8Array(new TextEncoder().encode(text));
const DEMO_SALTS: Record<'A' | 'B', number> = { A: 104729, B: 1299709 };
const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
/** The demo key-choice rule, retyped: a seeded mulberry32 stream of eight 32-bit words, reduced into 1..n-1. */
const scalarFor = (seed: number, party: 'A' | 'B', n: number): bigint => {
  const rnd = mulberry32((seed * 7919 + DEMO_SALTS[party] + n * 15485863) >>> 0);
  let k = 0n;
  for (let i = 0; i < 8; i++) k = (k << 32n) | BigInt(Math.floor(rnd() * 2 ** 32));
  return (k % (P256_ORDER - 1n)) + 1n;
};
const other = (p: Party): Party => (p === 'A' ? 'B' : 'A');

const bytesOf = (hex: string): Uint8Array => hexToBytes(hex);
const hmacNode = (key: Uint8Array, byte: number): Uint8Array => bytesOf(nodeHmac('sha256', key, Uint8Array.of(byte), 'hex'));
const pubHexNode = new Map<bigint, string>();
const publicHex = (priv: bigint): string => {
  let hex = pubHexNode.get(priv);
  if (!hex) {
    hex = nodeEcdhPublic('prime256v1', priv);
    pubHexNode.set(priv, hex);
  }
  return hex;
};
const dhNode = (priv: bigint, peerHex: string): Uint8Array => bytesOf(nodeEcdhSecret('prime256v1', priv, peerHex));
const rkNode = (rk: Uint8Array, d: Uint8Array) => {
  const okm = nodeHkdf(d, rk, utf8('kinetic-demo-ratchet'), 64);
  return { rk: okm.slice(0, 32), ck: okm.slice(32) };
};
const msgKeysNode = (mk: Uint8Array) => {
  const okm = nodeHkdf(mk, new Uint8Array(0), utf8('kinetic-demo-msg'), 44);
  return { key: okm.slice(0, 32), nonce: okm.slice(32) };
};
const headerNode = (pubHex: string, n: number): Uint8Array => Uint8Array.from([...bytesOf(pubHex), n & 0xff]);
const sealNode = (mk: Uint8Array, header: Uint8Array, text: string): Uint8Array => {
  const { key, nonce } = msgKeysNode(mk);
  return nodeAesGcmSeal(key, nonce, utf8(text), header);
};

interface NState {
  party: Party;
  rk: Uint8Array | null;
  priv: bigint;
  pubHex: string;
  remoteHex: string;
  cks: Uint8Array | null;
  ckr: Uint8Array | null;
  ns: number;
  made: number;
}
interface NMsg {
  sender: Party;
  header: Uint8Array;
  pubHex: string;
  sealed: Uint8Array;
  text: string;
}
const root = (): Uint8Array => bytesOf(nodeDigest('sha256', 'kinetic demo root', 'hex'));

function nodeStart(seed: number, mode: RatchetMode): { A: NState; B: NState } {
  const [pa, pb] = [scalarFor(seed, 'A', 0), scalarFor(seed, 'B', 0)];
  const [ha, hb] = [publicHex(pa), publicHex(pb)];
  const mk = (party: Party, priv: bigint, pubHex: string, remoteHex: string): NState => ({ party, rk: mode === 'full' ? root() : null, priv, pubHex, remoteHex, cks: null, ckr: null, ns: 0, made: 1 });
  const s = { A: mk('A', pa, ha, hb), B: mk('B', pb, hb, ha) };
  if (mode === 'symmetric') {
    const ab = bytesOf(nodeDigest('sha256', 'demo chain 0', 'hex'));
    const ba = hmacNode(root(), 0x0b);
    s.A = { ...s.A, cks: ab, ckr: ba };
    s.B = { ...s.B, cks: ba, ckr: ab };
  }
  return s;
}

/** The sender's key for its next message, with the state after it (the DH send step when it has no sending chain yet). */
function nodeSendKey(seed: number, st: NState): { state: NState; mk: Uint8Array; header: Uint8Array } {
  let s = st;
  if (s.cks === null) {
    const priv = scalarFor(seed, s.party, s.made);
    const pubHex = publicHex(priv);
    const stepped = rkNode(s.rk!, dhNode(priv, s.remoteHex));
    s = { ...s, rk: stepped.rk, priv, pubHex, cks: stepped.ck, ns: 0, made: s.made + 1 };
  }
  const mk = hmacNode(s.cks!, 1);
  return { state: { ...s, cks: hmacNode(s.cks!, 2), ns: s.ns + 1 }, mk, header: headerNode(s.pubHex, s.ns) };
}

function nodeReceive(seed: number, st: NState, header: Uint8Array, mode: RatchetMode): { state: NState; mk: Uint8Array } {
  let s = st;
  const pubHex = toHex(header.slice(0, 65));
  if (mode === 'full' && pubHex !== s.remoteHex) {
    const first = rkNode(s.rk!, dhNode(s.priv, pubHex));
    const priv = scalarFor(seed, s.party, s.made);
    const second = rkNode(first.rk, dhNode(priv, pubHex));
    s = { ...s, rk: second.rk, ckr: first.ck, cks: second.ck, priv, pubHex: publicHex(priv), remoteHex: pubHex, ns: 0, made: s.made + 1 };
  }
  return { state: { ...s, ckr: hmacNode(s.ckr!, 2) }, mk: hmacNode(s.ckr!, 1) };
}

function nodeRun(seed: number, pattern: readonly Party[], texts: readonly string[], mode: RatchetMode) {
  let st = nodeStart(seed, mode);
  const messages: NMsg[] = [];
  const after: { A: NState; B: NState }[] = [];
  pattern.forEach((sender, i) => {
    const sent = nodeSendKey(seed, st[sender]);
    const got = nodeReceive(seed, st[other(sender)], sent.header, mode);
    st = { ...st, [sender]: sent.state, [other(sender)]: got.state } as { A: NState; B: NState };
    messages.push({ sender, header: sent.header, pubHex: toHex(sent.header.slice(0, 65)), sealed: sealNode(sent.mk, sent.header, texts[i]), text: texts[i] });
    after.push(st);
  });
  return { messages, after };
}

/** Formulation B on node: a clone of the stolen party replays the traffic with fresh keys from another seed; readable iff its key authenticates the real ciphertext. */
function nodeCloneReadable(run: ReturnType<typeof nodeRun>, party: Party, k: number, mode: RatchetMode, cloneSeed: number): boolean[] {
  let s = run.after[k - 1][party];
  return run.messages.map((m, i) => {
    if (i < k) return false;
    let mk: Uint8Array;
    if (m.sender === party) {
      const step = nodeSendKey(cloneSeed, s);
      s = step.state;
      mk = step.mk;
    } else {
      const got = nodeReceive(cloneSeed, s, m.header, mode);
      s = got.state;
      mk = got.mk;
    }
    const { key, nonce } = msgKeysNode(mk);
    const opened = nodeAesGcmOpen(key, nonce, m.sealed, m.header);
    return opened !== null && new TextDecoder().decode(opened) === m.text;
  });
}

const texts = (n: number) => Array.from({ length: n }, (_, i) => `test line ${i + 1} of ${n}`);
const patternOf = (n: number, length: number): Party[] => Array.from({ length }, (_, i) => (((n >> i) & 1) === 1 ? 'B' : 'A'));
const ids = (readable: readonly boolean[]) => readable.flatMap((r, i) => (r ? [i + 1] : []));

/* ── tests ────────────────────────────────────────────────────────────────── */

describe('the HMAC chain, against node:crypto', () => {
  it('CK0 = SHA-256("demo chain 0") begins 14c4c951 601714ac, and MK1..3 and CK1..3 equal createHmac over the full 32 bytes', async () => {
    const ck0 = demoChainKey();
    expect(toHex(ck0)).toBe(nodeDigest('sha256', 'demo chain 0', 'hex'));
    expect(toHex(ck0).slice(0, 16)).toBe('14c4c951601714ac');
    let ck = ck0;
    const expectedPrefix = [['4007f5bdcb0c2a18', '73ba06837dd537de'], ['f497aed40c6ebdce', '0ca75100a061a86f'], ['bb7af2cbbb23a071', '79592c7bea88f9c9']];
    for (const [mkPrefix, ckPrefix] of expectedPrefix) {
      const step = await chainStep(ck);
      expect(toHex(step.mk)).toBe(nodeHmac('sha256', ck, Uint8Array.of(1), 'hex'));
      expect(toHex(step.ck)).toBe(nodeHmac('sha256', ck, Uint8Array.of(2), 'hex'));
      expect([toHex(step.mk).slice(0, 16), toHex(step.ck).slice(0, 16)]).toEqual([mkPrefix, ckPrefix]);
      ck = step.ck;
    }
  });
});

describe('the lesson protocol equals an independent node:crypto implementation', () => {
  it('for 100 seeded conversations in full mode, headers and sealed bytes are identical', async () => {
    const rnd = mulberry32(2024);
    for (let c = 0; c < 100; c++) {
      const pattern = patternOf(Math.floor(rnd() * 64), 6);
      const seed = 1 + c;
      const ours = await runConversation(realAlgebra(seed), pattern, texts(6), 'full');
      const ref = nodeRun(seed, pattern, texts(6), 'full');
      ours.messages.forEach((m, i) => {
        expect(toHex(headerBytes(m.header)), `conversation ${c} message ${i} header`).toBe(toHex(ref.messages[i].header));
        expect(toHex(m.sealed), `conversation ${c} message ${i} ciphertext`).toBe(toHex(ref.messages[i].sealed));
      });
    }
  }, 300_000);

  it('the symmetric-only mode and the plain AES-GCM / HKDF primitives agree with node too', async () => {
    const pattern = parsePattern('ABBAAB');
    const ours = await runConversation(realAlgebra(5), pattern, texts(6), 'symmetric');
    const ref = nodeRun(5, pattern, texts(6), 'symmetric');
    ours.messages.forEach((m, i) => expect(toHex(m.sealed)).toBe(toHex(ref.messages[i].sealed)));
    // the first A message uses the demo chain: MK1 begins 4007f5bd cb0c2a18
    expect(toHex(ours.messages[0].mk).slice(0, 16)).toBe('4007f5bdcb0c2a18');
    const mk = ours.messages[0].mk;
    expect(toHex((await hkdf(mk, new Uint8Array(0), utf8('kinetic-demo-msg'), 44))!)).toBe(toHex(nodeHkdf(mk, new Uint8Array(0), utf8('kinetic-demo-msg'), 44)));
  });

  it('AES-GCM rejects a flipped bit anywhere in the ciphertext, the tag or the header, and a wrong key, on 200 seeded flips', async () => {
    const run = (await buildRun(parsePattern('AB'), texts(2), 'full', 3))!;
    const m = run.messages[0];
    const rnd = mulberry32(8);
    expect(await openWith(m.mk, m.header, m.sealed)).toBe(m.text);
    for (let i = 0; i < 200; i++) {
      const sealed = Uint8Array.from(m.sealed) as Bytes;
      const bit = Math.floor(rnd() * sealed.length * 8);
      sealed[bit >> 3] ^= 1 << (bit & 7);
      expect(await openWith(m.mk, m.header, sealed)).toBeNull();
      const headerFlipped = { pub: m.header.pub, n: m.header.n ^ (1 << (i % 8)) };
      expect(await openWith(m.mk, headerFlipped, m.sealed)).toBeNull();
    }
    const wrong = Uint8Array.from(m.mk) as Bytes;
    wrong[0] ^= 1;
    expect(await openWith(wrong, m.header, m.sealed)).toBeNull();
    // and the underlying call raises the real OperationError
    const key = new Uint8Array(32);
    const sealed = (await aesGcmEncrypt(key, new Uint8Array(12), utf8('x')))!;
    sealed[0] ^= 1;
    await expect(aesGcmDecrypt(key, new Uint8Array(12), sealed)).rejects.toThrow();
  }, 60_000);
});

describe('who can read what: the spec sets, by derivation closure', () => {
  const readableSet = async (pattern: string, mode: RatchetMode, party: Party, k: number) => ids(reading(await symbolicRun(parsePattern(pattern), mode), party, k).readable);

  it('AABBAB with Alice stolen after message k', async () => {
    const expected: [number, number[]][] = [[1, [2, 3, 4]], [2, [3, 4]], [3, [4, 5, 6]], [4, [5, 6]], [5, [6]], [6, []]];
    for (const [k, set] of expected) expect(await readableSet('AABBAB', 'full', 'A', k), `k=${k}`).toEqual(set);
  });

  it('ABABAB, AAAAAA and AABBBA', async () => {
    expect(await readableSet('ABABAB', 'full', 'A', 1)).toEqual([2]);
    expect(await readableSet('ABABAB', 'full', 'A', 2)).toEqual([3, 4]);
    expect(await readableSet('ABABAB', 'full', 'A', 3)).toEqual([4]);
    expect(await readableSet('ABABAB', 'full', 'A', 4)).toEqual([5, 6]);
    for (let k = 1; k <= 5; k++) expect(await readableSet('AAAAAA', 'full', 'A', k), `monologue k=${k}`).toEqual(Array.from({ length: 6 - k }, (_, i) => k + 1 + i));
    expect(await readableSet('AABBBA', 'full', 'A', 1)).toEqual([2, 3, 4, 5]);
    expect(await readableSet('AABBBA', 'full', 'A', 3)).toEqual([4, 5, 6]);
  });

  it('the mode comparison for AABBAB stolen after message 2: fixed key opens all 6, symmetric only m3 to m6, full ratchet m3 and m4', async () => {
    const rows = await compareModes(parsePattern('AABBAB'), 'A', 2);
    expect(rows.map((r) => [r.protection, r.opens])).toEqual([['fixed', [1, 2, 3, 4, 5, 6]], ['symmetric', [3, 4, 5, 6]], ['full', [3, 4]]]);
  });

  it('the same comparison with Alice stolen after message 1 (what the key idea quotes): fixed all 6, symmetric m2 to m6, full m2 to m4', async () => {
    const rows = await compareModes(parsePattern('AABBAB'), 'A', 1);
    expect(rows.map((r) => [r.protection, r.opens])).toEqual([['fixed', [1, 2, 3, 4, 5, 6]], ['symmetric', [2, 3, 4, 5, 6]], ['full', [2, 3, 4]]]);
  });

  it('the healing point of AABBAB after message 1 is message 5 (index 4), and it depends on a key made after the theft', async () => {
    const sym = await symbolicRun(parsePattern('AABBAB'), 'full');
    const r = reading(sym, 'A', 1);
    expect(r.healing).toBe(4);
    expect(dependsOnFreshKey(sym, 1, 4)).toBe(true);
    // a readable message does not depend on any key generated after the theft
    expect(dependsOnFreshKey(sym, 1, 3)).toBe(false);
  });
});

describe('formulation A (closure) equals formulation B (clone replay on node:crypto) on every case', () => {
  it('all 2^8 sender patterns of length 8 x each stolen point k = 1..8 x each of Alice and Bob: 4,096 cases', async () => {
    let cases = 0;
    for (let n = 0; n < 256; n++) {
      const pattern = patternOf(n, 8);
      const sym = await symbolicRun(pattern, 'full');
      const ref = nodeRun(DEFAULT_SEED, pattern, texts(8), 'full');
      for (const party of ['A', 'B'] as const) {
        for (let k = 1; k <= 8; k++) {
          const a = reading(sym, party, k).readable;
          const b = nodeCloneReadable(ref, party, k, 'full', DEFAULT_SEED ^ CLONE_SALT);
          expect(a, `pattern ${pattern.join('')} ${party} k=${k}`).toEqual(b);
          cases++;
        }
      }
    }
    expect(cases).toBe(4096);
  }, 600_000);

  it('the same holds in symmetric-only mode on a sample, and the lesson clone replay (real Web Crypto) agrees with closure', async () => {
    for (const text of ['ABABAB', 'AABBAB', 'BABAAB']) {
      const pattern = parsePattern(text);
      const sym = await symbolicRun(pattern, 'symmetric');
      const ref = nodeRun(4, pattern, texts(6), 'symmetric');
      for (const party of ['A', 'B'] as const) {
        for (let k = 1; k <= 6; k++) {
          expect(reading(sym, party, k).readable).toEqual(nodeCloneReadable(ref, party, k, 'symmetric', 4 ^ CLONE_SALT));
        }
      }
    }
    const run = (await buildRun(parsePattern('AABBAB'), texts(6), 'full', 6))!;
    const sym = await symbolicRun(parsePattern('AABBAB'), 'full');
    for (const [party, k] of [['A', 1], ['A', 3], ['B', 2], ['B', 5]] as const) {
      expect(await cloneReadable(run, party, k, 'full', 6 ^ CLONE_SALT), `${party} ${k}`).toEqual(reading(sym, party, k).readable);
    }
  }, 120_000);
});

describe('forward secrecy and recovery, computed', () => {
  it('for 200 seeded patterns and every k, no earlier message is readable under symmetric-only or full mode (closure over every derivable value)', async () => {
    const rnd = mulberry32(31);
    for (let c = 0; c < 200; c++) {
      const length = 3 + Math.floor(rnd() * 8);
      const pattern = patternOf(Math.floor(rnd() * 1024), length);
      for (const mode of ['symmetric', 'full'] as const) {
        const sym = await symbolicRun(pattern, mode);
        for (const party of ['A', 'B'] as const) {
          for (let k = 1; k <= length; k++) {
            const { readable } = reading(sym, party, k);
            for (let i = 0; i < k; i++) expect(readable[i], `${mode} ${pattern.join('')} ${party} k=${k} i=${i}`).toBe(false);
          }
        }
      }
    }
  }, 120_000);

  it('real AES-GCM tries: every derivable key fails on each earlier message, and the printed count equals the number of candidates', async () => {
    const run = (await buildRun(parsePattern('AABBAB'), texts(6), 'full', 11))!;
    for (const [party, k] of [['A', 4], ['B', 3], ['A', 6]] as const) {
      const a = await analyse(run, parsePattern('AABBAB'), 'full', party, k, 11);
      for (let i = 0; i < k; i++) {
        expect(a.tries[i].openedBy, `${party} k=${k} message ${i + 1}`).toBeNull();
        expect(a.tries[i].tries).toBe(a.candidates);
      }
      expect(a.agree).toBe(true);
    }
  }, 120_000);

  it('recovery: in an alternating pattern the first message after the next fresh key is sealed, in AAAAAA it is not', async () => {
    const alt = reading(await symbolicRun(parsePattern('ABABAB'), 'full'), 'A', 1);
    expect(alt.healing).toBe(2);
    const mono = reading(await symbolicRun(parsePattern('AAAAAA'), 'full'), 'A', 1);
    expect(mono.healing).toBeNull();
    expect(mono.readable.slice(1)).toEqual([true, true, true, true, true]);
  });

  it('counterfactuals: the fixed key opens every message for every theft point (stolen after message 3 opens message 1)', async () => {
    const run = (await buildRun(parsePattern('AABBAB'), texts(6), 'full', 11))!;
    const fixed = await fixedKeyRun(run.messages.map((m) => m.text), run.messages.map((m) => m.header.pub));
    for (let i = 0; i < 6; i++) expect(await fixedOpens(fixed, i)).toBe(true);
    const a = await analyse(run, parsePattern('AABBAB'), 'fixed', 'A', 3, 11);
    expect(a.readable[0]).toBe(true);
    expect(a.tries[0].openedBy).toBe('the one fixed key');
  });

  it('counterfactual: symmetric-only opens every later message in both directions and never heals', async () => {
    for (const text of ['AABBAB', 'ABABAB', 'BBAABA']) {
      const sym = await symbolicRun(parsePattern(text), 'symmetric');
      for (const party of ['A', 'B'] as const) {
        for (let k = 1; k <= 5; k++) {
          const r = reading(sym, party, k);
          expect(ids(r.readable)).toEqual(Array.from({ length: 6 - k }, (_, i) => k + 1 + i));
          expect(r.healing).toBeNull();
        }
      }
    }
  });

  it('counterfactual: a ratchet whose new private keys are derived from the previous one (no fresh randomness) never heals, and reads exactly what the symmetric-only ratchet reads', async () => {
    // The wrapped algebra changes the protocol: every key pair after the first is a one-way function of the party's previous private key,
    // so a thief holding that key can compute them all. The graph decides, nothing is added to the thief's knowledge by hand.
    const predictable = (alg: SymAlgebra): SymAlgebra => {
      const latest: Partial<Record<Party, number>> = {};
      return {
        ...alg,
        keyPair: async (party, n) => {
          if (n === 0 || latest[party] === undefined) {
            const base = await alg.keyPair(party, n);
            latest[party] = base.priv;
            return base;
          }
          const priv = (await alg.kdfCk(latest[party]!)).ck;
          latest[party] = priv;
          return { priv, pub: { of: priv } };
        },
      };
    };
    for (const text of ['ABABAB', 'AABBAB', 'ABBABA']) {
      const pattern = parsePattern(text);
      const broken = await symbolicRun(pattern, 'full', predictable);
      const sound = await symbolicRun(pattern, 'full');
      const symmetric = await symbolicRun(pattern, 'symmetric');
      for (const party of ['A', 'B'] as const) {
        for (let k = 1; k < pattern.length; k++) {
          const b = reading(broken, party, k);
          expect(b.healing, `${text} ${party} k=${k}: predictable keys never heal`).toBeNull();
          expect(ids(b.readable), `${text} ${party} k=${k}`).toEqual(Array.from({ length: pattern.length - k }, (_, i) => k + 1 + i));
          expect(ids(b.readable)).toEqual(ids(reading(symmetric, party, k).readable));
        }
      }
      // and the sound protocol does heal in the alternating pattern, so the two runs really differ
      expect(reading(sound, 'A', 1).healing).not.toBeNull();
    }
  });

  it('counterfactual: a KDF that returns the chain key unchanged fails forward secrecy (the thief reads earlier messages of the chain)', async () => {
    const stuck = (alg: SymAlgebra): SymAlgebra => ({
      ...alg,
      kdfCk: async (ck) => {
        const step = await alg.kdfCk(ck);
        return { mk: step.mk, ck };
      },
    });
    // with an unchanged chain key every message key is the same node as the previous one, so a state copied after message 3 reads message 1
    const sym = await symbolicRun(parsePattern('AAAAAA'), 'full', stuck);
    expect(reading(sym, 'A', 3).readable[0]).toBe(true);
    const sound = await symbolicRun(parsePattern('AAAAAA'), 'full');
    expect(reading(sound, 'A', 3).readable[0]).toBe(false);
  });
});

describe('the bit the page names is the bit that flips', () => {
  it('for every target, every slider value 0..127 and every message length, exactly one bit differs, at the named byte and bit', async () => {
    const run = (await buildRun(parsePattern('AB'), texts(2), 'full', 3))!;
    for (const m of run.messages) {
      for (const target of ['ciphertext', 'tag', 'header'] as const) {
        for (let bit = 0; bit <= 127; bit++) {
          const site = flipSite(target, bit, m.sealed.length);
          const sealed = Uint8Array.from(m.sealed);
          let header = m.header;
          if (target === 'header') header = { pub: m.header.pub, n: m.header.n ^ (1 << site.bit) };
          else sealed[(target === 'tag' ? sealed.length - 16 : 0) + site.byte] ^= 1 << site.bit;
          // exactly one bit differs from the original message, and it is the one named
          const diff = [...sealed].flatMap((b, i) => (b === m.sealed[i] ? [] : [[i, b ^ m.sealed[i]]]));
          if (target === 'header') {
            expect(diff).toEqual([]);
            expect(header.n ^ m.header.n).toBe(1 << site.bit);
          } else {
            expect(diff).toEqual([[(target === 'tag' ? sealed.length - 16 : 0) + site.byte, 1 << site.bit]]);
          }
          expect(site.text).toContain(`bit ${site.bit}`);
          expect(site.byte).toBeLessThan(target === 'tag' ? 16 : target === 'ciphertext' ? sealed.length - 16 : 1);
        }
      }
    }
    // the old caption said "header, bit 100" for a flip of counter bit 4 (100 % 8)
    expect(flipSite('header', 100, 40).text).toBe('header counter byte, bit 4');
    expect(flipSite('ciphertext', 100, 40).text).toBe('ciphertext byte 12, bit 4');
  });
});

describe('tampering', () => {
  it('manipulation 3: a flipped bit in the ciphertext, the tag or the header counter is refused, and the untouched message opens', async () => {
    const run = (await buildRun(parsePattern('AB'), texts(2), 'full', 3))!;
    const m = run.messages[0];
    expect(await openWith(m.mk, m.header, m.sealed)).toBe(m.text);
    for (const target of ['ciphertext', 'tag', 'header'] as const) {
      for (let bit = 0; bit < 24; bit++) {
        const r = await tamper(m.mk, m, target, bit);
        expect(r, `${target} bit ${bit}`).toEqual({ opened: false, text: null });
      }
    }
  });
});

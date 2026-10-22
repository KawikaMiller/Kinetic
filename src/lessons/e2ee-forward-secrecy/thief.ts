import type { AffinePoint } from '../../core/ecc';
import { aesGcmDecrypt, aesGcmEncrypt, hkdf } from '../../core/crypto';
import {
  chainStep, dhSecret, headerBytes, openWith, realAlgebra, utf8, demoRoot,
  type Bytes,
} from './realAlg';
import { deriveSendKey, receive, type Header, type Message, type Party, type PartyState, type RatchetMode, type Run } from './ratchet';

export type RealState = PartyState<Bytes, bigint, AffinePoint>;
export type RealRun = Run<Bytes, bigint, AffinePoint, Bytes>;
export type RealMessage = Message<AffinePoint, Bytes, Bytes>;

/** The chain steps tried from every stolen chain and every Diffie-Hellman step. */
export const CHAIN_LOOKAHEAD = 10;

export interface Candidate {
  /** Where the key came from, for the explanation. */
  source: string;
  mk: Bytes;
}

async function walk(ck: Bytes, source: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  let current = ck;
  for (let step = 1; step <= CHAIN_LOOKAHEAD; step++) {
    const next = await chainStep(current);
    out.push({ source: `${source}, step ${step}`, mk: next.mk });
    current = next.ck;
  }
  return out;
}

const distinctPubs = (messages: readonly RealMessage[]): AffinePoint[] => {
  const seen = new Map<string, AffinePoint>();
  for (const m of messages) seen.set(`${m.header.pub.x}|${m.header.pub.y}`, m.header.pub);
  return [...seen.values()];
};

/**
 * Every message key the thief can compute from a copied state without more secrets: the next 10 steps of each stolen
 * chain, and for each distinct header public key on the wire one Diffie-Hellman step (with the stolen private key
 * and the stolen root) followed by 10 chain steps. Nothing reaches backwards: that is a property of the model.
 */
export async function candidateKeys(state: RealState, messages: readonly RealMessage[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  if (state.cks) out.push(...(await walk(state.cks, 'the stolen sending chain')));
  if (state.ckr) out.push(...(await walk(state.ckr, 'the stolen receiving chain')));
  if (state.rk) {
    const root = state.rk;
    for (const [i, pub] of distinctPubs(messages).entries()) {
      const stepped = await realAlgebra(0).kdfRk(root, dhSecret(state.priv, pub));
      out.push(...(await walk(stepped.ck, `a Diffie-Hellman step with header key ${i + 1}`)));
    }
  }
  return out;
}

export interface Tries {
  /** Keys tried against this message. */
  tries: number;
  /** Which candidate opened it, or null. */
  openedBy: string | null;
}

/** Real AES-GCM attempts of every candidate key on one message: each wrong key fails authentication. */
export async function tryMessage(candidates: readonly Candidate[], m: RealMessage): Promise<Tries> {
  for (let i = 0; i < candidates.length; i++) {
    if ((await openWith(candidates[i].mk, m.header, m.sealed)) !== null) return { tries: i + 1, openedBy: candidates[i].source };
  }
  return { tries: candidates.length, openedBy: null };
}

/**
 * Formulation B: a clone of the stolen party starts from the copied state and processes the real traffic as that party
 * would, except that its fresh key pairs come from `cloneSeed`. A message is readable when the clone's derived key opens
 * the real ciphertext with real AES-GCM.
 */
export async function cloneReadable(run: RealRun, party: Party, k: number, mode: RatchetMode, cloneSeed: number): Promise<boolean[]> {
  const alg = realAlgebra(cloneSeed);
  let state: RealState = run.after[k - 1][party];
  const out: boolean[] = run.messages.map(() => false);
  for (let i = k; i < run.messages.length; i++) {
    const m = run.messages[i];
    if (m.sender === party) {
      const step = await deriveSendKey(alg, state);
      state = step.state;
      out[i] = (await openWith(step.mk, m.header, m.sealed)) !== null;
    } else {
      const got = await receive(alg, state, m.header, m.sealed, mode);
      state = got.state;
      out[i] = got.text !== null;
    }
  }
  return out;
}

/* ── the one-fixed-key mode ───────────────────────────────────────────────── */

export const FIXED_INFO = 'kinetic-demo-fixed';

export interface FixedRun {
  key: Bytes;
  sealed: Bytes[];
  headers: Header<AffinePoint>[];
}

const counterNonce = (counter: number): Bytes => {
  const nonce = new Uint8Array(12);
  nonce[11] = counter & 0xff;
  return nonce;
};

/** One AES-256-GCM key for the whole chat, the message counter as the nonce and as the authenticated header byte. */
export async function fixedKeyRun(texts: readonly string[], pubs: readonly AffinePoint[]): Promise<FixedRun> {
  const okm = await hkdf(demoRoot(), new Uint8Array(0), utf8(FIXED_INFO), 32);
  if (!okm) throw new Error('needs https or localhost: crypto.subtle is not available');
  const headers = texts.map((_, i) => ({ pub: pubs[0], n: i }));
  const sealed: Bytes[] = [];
  for (let i = 0; i < texts.length; i++) {
    const out = await aesGcmEncrypt(okm, counterNonce(i), utf8(texts[i]), headerBytes(headers[i]));
    if (!out) throw new Error('needs https or localhost: crypto.subtle is not available');
    sealed.push(out);
  }
  return { key: okm, sealed, headers };
}

/** Whether the stolen fixed key opens message i, by real AES-GCM. */
export async function fixedOpens(run: FixedRun, i: number): Promise<boolean> {
  try {
    await aesGcmDecrypt(run.key, counterNonce(i), run.sealed[i], headerBytes(run.headers[i]));
    return true;
  } catch {
    return false;
  }
}

/* ── tampering ────────────────────────────────────────────────────────────── */

export type TamperTarget = 'ciphertext' | 'tag' | 'header';
export const TAMPER_REFUSAL = 'the tag does not match: the message is refused, no plaintext released';

export interface TamperResult {
  opened: boolean;
  text: string | null;
}

export interface FlipSite {
  region: 'ciphertext' | 'tag' | 'header counter';
  /** Byte index inside the region. */
  byte: number;
  /** Bit 0 to 7 inside that byte. */
  bit: number;
  /** Words for the page: the bit that is actually flipped, not the slider value. */
  text: string;
}

/** Where the slider value `bit` lands for a message whose sealed bytes are `sealedLength` long: the body and tag indices wrap, the header flips one bit of its one counter byte. */
export function flipSite(target: TamperTarget, bit: number, sealedLength: number): FlipSite {
  const inByte = bit % 8;
  if (target === 'header') return { region: 'header counter', byte: 0, bit: inByte, text: `header counter byte, bit ${inByte}` };
  const span = target === 'tag' ? 16 : sealedLength - 16;
  const byte = Math.floor(bit / 8) % span;
  return { region: target, byte, bit: inByte, text: `${target} byte ${byte}, bit ${inByte}` };
}

/** Flips one bit of the ciphertext body, of the 16-byte tag or of the header's counter byte, then tries a real open with the right key. */
export async function tamper(mk: Bytes, m: RealMessage, target: TamperTarget, bit: number): Promise<TamperResult> {
  const sealed = Uint8Array.from(m.sealed) as Bytes;
  let header = m.header;
  const site = flipSite(target, bit, sealed.length);
  if (target === 'header') {
    header = { pub: m.header.pub, n: m.header.n ^ (1 << site.bit) };
  } else {
    sealed[(target === 'tag' ? sealed.length - 16 : 0) + site.byte] ^= 1 << site.bit;
  }
  const text = await openWith(mk, header, sealed);
  return { opened: text !== null, text };
}

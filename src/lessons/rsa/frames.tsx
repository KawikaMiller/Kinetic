import type { ReactNode } from 'react';
import { humanDuration, power, superscript } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  GNFS_RECORD_BITS, REAL_E, repeatedCiphertexts, trialDivisionsLog2, trialSeconds, type Item, type Keygen, type KeyStep, type KeyStepId, type RsaKey,
} from './model';

export const group = (v: bigint | number) => v.toLocaleString('en-US');

/** An exponent written as superscript digits: 65¹⁷. */
export const pow = (base: bigint | number, exp: bigint) => <>{group(base)}{superscript(Number(exp))}</>;
const lock = '🔒';

// ── Key generation ──────────────────────────────────────────────────

export interface KeyFrame extends Frame {
  /** How many steps are on screen; the last of them is the current one. */
  shown: number;
  /** True on the closing summary. */
  done: boolean;
}

function stepCaption(s: KeyStep, g: Keygen, p: bigint, q: bigint, e: bigint): ReactNode {
  if (!s.ok) {
    const factors = s.factors && s.factors.length > 1 ? <>: {s.factors.map(String).join(' × ')}</> : null;
    if (s.id === 'p' || s.id === 'q') return <><span className="hl bad">{s.id} = {group(s.id === 'p' ? p : q)} isn't prime</span>{factors}. RSA needs two primes, so the key stops here.</>;
    return <><span className="hl bad">Stop: {s.reason}.</span></>;
  }
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  const text: Record<KeyStepId, () => ReactNode> = {
    p: () => <>p = {group(p)} is prime. Keep it secret {lock}.</>,
    q: () => <>q = {group(q)} is prime. Keep it secret {lock} too.</>,
    distinct: () => <>p ≠ q. (With p = q, n would be p², and anyone could take its square root.)</>,
    n: () => <>n = p × q = {group(p)} × {group(q)} = <span className="hl info">{group(n)}</span>. n is public: half of the public key.</>,
    phi: () => <>φ = (p − 1)(q − 1) = {group(p - 1n)} × {group(q - 1n)} = {group(phi)}. Keep φ secret {lock}: anyone who knows it can
      work out d.</>,
    'e-range': () => (e >= phi
      ? <>e = <span className="hl info">{group(e)}</span> is bigger than φ = {group(phi)}, and that's fine: it acts exactly like e mod φ ={' '}
        {group(e % phi)}. Only gcd(e, φ) = 1 is required; keeping e below φ is just a textbook habit.
        {e === REAL_E ? ' 65537 = 2¹⁶ + 1 is what real keys use (FIPS 186-5 asks for 2¹⁶ < e < 2²⁵⁶).' : ''}</>
      : <>e = <span className="hl info">{group(e)}</span> is the public exponent: it only has to be bigger than 1 and share no factor with
        φ. (Real keys almost always use e = 65537 = 2¹⁶ + 1.)</>),
    gcd: () => <>gcd(e, φ) = 1, by Euclid's remainders in the table: e shares no factor with φ, so it has an inverse mod φ.</>,
    d: () => <>Run Euclid backwards: {group(phi)}·x + {group(e)}·y = 1 with y = {group(g.y!)}, so d = {group(g.y!)} mod {group(phi)} ={' '}
      <span className="hl violet">{group(s.value!)}</span>. Check: {group(e)} × {group(s.value!)} = {group(e * s.value!)} ={' '}
      {group((e * s.value!) / phi)} × {group(phi)} + 1. (FIPS 186-5 uses lcm(p − 1, q − 1) instead of φ; either gives a
      working d.)</>,
  };
  return text[s.id]();
}

export function keygenFrames(g: Keygen, p: bigint, q: bigint, e: bigint): KeyFrame[] {
  const r = createRecorder<KeyFrame>({ shown: 0, done: false });
  r.snap(<>Making a key: pick two primes p and q and a public exponent e, then check each choice in turn.</>);
  g.steps.forEach((s, i) => r.snap(stepCaption(s, g, p, q, e), s.ok ? 1 : 1.6, { shown: i + 1 }));
  r.set({ done: true });
  if (g.key) {
    r.close(<>Public key <span className="hl info">(n, e) = ({group(g.key.n)}, {group(g.key.e)})</span>: publish it. Private key{' '}
      <span className="hl violet">d = {group(g.key.d)} {lock}</span>: it never leaves the owner, and nor do p, q and φ.</>, 2);
  } else {
    const failed = g.steps.at(-1)!;
    r.close(<><span className="hl bad">No key.</span> {failed.reason}. Change {failed.id === 'p' || failed.id === 'q' ? failed.id : failed.id === 'distinct' ? 'q' : 'e'} and press Generate.</>, 2);
  }
  return r.frames;
}

// ── Encrypt and decrypt ─────────────────────────────────────────────

export type EncPhase = 'start' | 'enc' | 'dec' | 'done';

export interface EncFrame extends Frame {
  phase: EncPhase;
  /** The item being worked on (encrypt or decrypt). */
  i: number;
  /** How many ciphertexts and decrypts are filled in so far. */
  encrypted: number;
  decrypted: number;
}

const what = (it: Item) => (it.ch === undefined ? <>m = {group(it.m)}</> : <>"{it.ch}" → m = {group(it.m)}</>);

export function encryptFrames(k: RsaKey, items: readonly Item[]): EncFrame[] {
  const r = createRecorder<EncFrame>({ phase: 'start', i: 0, encrypted: 0, decrypted: 0 });
  r.snap(<>Encrypt with the <span className="hl info">public key</span>: c = mᵉ mod n. Anyone can do this step.</>);
  items.forEach((it, i) => {
    r.snap(<>{what(it)}: c = {pow(it.m, k.e)} mod {group(k.n)} = <span className="hl orange">{group(it.c)}</span>.</>, 1, {
      phase: 'enc', i, encrypted: i + 1,
    });
  });
  items.forEach((it, i) => {
    r.snap(<>Decrypt with the <span className="hl violet">private d</span>: {pow(it.c, k.d)} mod {group(k.n)} ={' '}
      <span className="hl ok">{group(it.back)}</span>{it.ch === undefined ? '' : <> = "{String.fromCodePoint(Number(it.back))}"</>}. Only d undoes it.</>, 1, {
      phase: 'dec', i, decrypted: i + 1,
    });
  });
  r.set({ phase: 'done' });
  r.close(encryptSummary(items), 2.4);
  return r.frames;
}

/** The closing caption: computed from the items, so repeats are named only when they happen. */
export function encryptSummary(items: readonly Item[]): ReactNode {
  const allBack = items.every((it) => it.back === it.m);
  const back = allBack ? 'Every ciphertext decrypted back to its message.' : 'Some ciphertexts did not decrypt back.';
  const repeats = repeatedCiphertexts(items);
  if (repeats.length > 0) {
    const label = (i: number) => (items[i].ch === undefined ? `m = ${group(items[i].m)}` : `"${items[i].ch}"`);
    const names = repeats.map((g) => <span key={g[0]}>{g === repeats[0] ? '' : ' and '}{label(g[0])} (<span className="hl bad">{group(items[g[0]].c)}</span>)</span>);
    return <>{back} But every copy of {names} gave the same ciphertext: textbook RSA is deterministic, so an eavesdropper sees which
      messages repeat. Real RSA adds fresh randomness to every message (OAEP padding).</>;
  }
  return <>{back} Encrypt the same message again and you'd get the same ciphertext: textbook RSA is deterministic, so real RSA adds
    fresh randomness to every message (OAEP padding).</>;
}

// ── Sign and verify ─────────────────────────────────────────────────

export interface SignResult {
  m: bigint;
  s: bigint;
  received: bigint;
  recovered: bigint;
  valid: boolean;
}

/** The verdict caption, computed from the check itself. */
export function signCaption(k: RsaKey, r: SignResult): ReactNode {
  const head = <>The owner signs with the private key: s = {pow(r.m, k.d)} mod {group(k.n)} = <span className="hl violet">{group(r.s)}</span>.
    Anyone checks with the public key: {pow(r.s, k.e)} mod {group(k.n)} = {group(r.recovered)}.</>;
  if (r.valid) return <>{head} That equals the message {group(r.received)}: <span className="hl ok">valid signature</span>.</>;
  return <>{head} The message received is {group(r.received)}, not {group(r.recovered)}:{' '}
    <span className="hl bad">signature rejected</span>. Editing the message without the private key breaks it.</>;
}

// ── Why size matters ────────────────────────────────────────────────

export function factorCaption(k: RsaKey, run: { factors: bigint[]; steps: number }): ReactNode {
  const [a, b] = run.factors;
  return <>Factored in {group(run.steps)} steps: n = {group(k.n)} = <span className="hl ok">{group(a)} × {group(b)}</span>. With p and q,
    anyone gets φ and then d: this toy key is broken. The work grows with √n, so every extra bit multiplies it by about 1.4.</>;
}

export function sizeCaption(bits: number): ReactNode {
  const trial = <>Trial division alone would need about {power(trialDivisionsLog2(bits))} divisions, {humanDuration(trialSeconds(bits))} at a
    billion a second (extrapolated).</>;
  if (bits <= GNFS_RECORD_BITS) {
    return <>{trial} But that's the slow way: numbers of {bits} bits or less <span className="hl bad">have actually been factored</span>{' '}
      with the general number field sieve (the public record is {GNFS_RECORD_BITS} bits, in 2020). A key this short is broken.</>;
  }
  return <>{trial} The much faster number field sieve hasn't publicly reached this size yet (record: {GNFS_RECORD_BITS} bits), and
    {bits < 2048 ? ' keys under 2048 bits are no longer recommended.' : " 2048 bits is today's minimum."}</>;
}

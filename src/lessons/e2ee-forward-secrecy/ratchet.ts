/**
 * A simplified ratchet in the spirit of the Signal Double Ratchet, NOT that protocol and not compatible with it:
 * one root key, one symmetric chain per direction, a Diffie-Hellman step whenever a header carries a new ratchet
 * public key. The protocol is written once over an algebra, so the same code runs on real bytes (realAlg.ts) and
 * on symbolic values for the thief's derivation closure (symAlg.ts).
 */
export type Party = 'A' | 'B';
export const PARTIES: readonly Party[] = ['A', 'B'];
export const other = (p: Party): Party => (p === 'A' ? 'B' : 'A');

/** The two ways a conversation is protected besides one fixed key: chains derived once, or a full ratchet. */
export type RatchetMode = 'symmetric' | 'full';

export interface Header<Pub> {
  /** The sender's current ratchet public key. */
  pub: Pub;
  /** The message's number in the sender's current chain. */
  n: number;
}

export interface KeyPair<Priv, Pub> {
  priv: Priv;
  pub: Pub;
}

/** The operations the protocol needs; S is a symmetric secret (root, chain or message key), D a Diffie-Hellman output. */
export interface Algebra<S, Priv, Pub, D, C> {
  /** The root secret both sides start from (a demo constant, never a real key). */
  initialRoot(): S;
  /** The n-th key pair of a party (n = 0 is its initial one); deterministic in (party, n). */
  keyPair(party: Party, n: number): Promise<KeyPair<Priv, Pub>>;
  dh(priv: Priv, pub: Pub): Promise<D>;
  kdfRk(rk: S, d: D): Promise<{ rk: S; ck: S }>;
  kdfCk(ck: S): Promise<{ mk: S; ck: S }>;
  /** The two directional chains of the symmetric-only mode, derived once from the root. */
  chains(root: S): Promise<{ ab: S; ba: S }>;
  seal(mk: S, header: Header<Pub>, text: string): Promise<C>;
  /** The plaintext, or null when authentication fails. */
  open(mk: S, header: Header<Pub>, sealed: C): Promise<string | null>;
  samePub(a: Pub, b: Pub): boolean;
}

export interface PartyState<S, Priv, Pub> {
  party: Party;
  /** The root key; null in symmetric-only mode, where the root is discarded after the chains are derived. */
  rk: S | null;
  priv: Priv;
  pub: Pub;
  /** The other side's latest ratchet public key as this party knows it. */
  remote: Pub;
  cks: S | null;
  ckr: S | null;
  ns: number;
  nr: number;
  /** Key pairs this party has generated so far, the initial one included. */
  made: number;
}

export interface Sent<S, Priv, Pub, C> {
  state: PartyState<S, Priv, Pub>;
  header: Header<Pub>;
  sealed: C;
  mk: S;
}

export interface Received<S, Priv, Pub> {
  state: PartyState<S, Priv, Pub>;
  text: string | null;
  mk: S;
}

export type Pair<S, Priv, Pub> = { A: PartyState<S, Priv, Pub>; B: PartyState<S, Priv, Pub> };

/** Both parties' starting states. In symmetric mode the chains are derived once and the root is dropped. */
export async function initParties<S, Priv, Pub, D, C>(alg: Algebra<S, Priv, Pub, D, C>, mode: RatchetMode): Promise<Pair<S, Priv, Pub>> {
  const [a, b] = [await alg.keyPair('A', 0), await alg.keyPair('B', 0)];
  const root = alg.initialRoot();
  const base = { ns: 0, nr: 0, made: 1 };
  if (mode === 'symmetric') {
    const { ab, ba } = await alg.chains(root);
    return {
      A: { party: 'A', rk: null, priv: a.priv, pub: a.pub, remote: b.pub, cks: ab, ckr: ba, ...base },
      B: { party: 'B', rk: null, priv: b.priv, pub: b.pub, remote: a.pub, cks: ba, ckr: ab, ...base },
    };
  }
  return {
    A: { party: 'A', rk: root, priv: a.priv, pub: a.pub, remote: b.pub, cks: null, ckr: null, ...base },
    B: { party: 'B', rk: root, priv: b.priv, pub: b.pub, remote: a.pub, cks: null, ckr: null, ...base },
  };
}

/** The sending side's first step: a fresh key pair and a new sending chain from its DH with the other side's key. */
async function sendStep<S, Priv, Pub, D, C>(alg: Algebra<S, Priv, Pub, D, C>, s: PartyState<S, Priv, Pub>): Promise<PartyState<S, Priv, Pub>> {
  const fresh = await alg.keyPair(s.party, s.made);
  const { rk, ck } = await alg.kdfRk(s.rk!, await alg.dh(fresh.priv, s.remote));
  return { ...s, rk, priv: fresh.priv, pub: fresh.pub, cks: ck, ns: 0, made: s.made + 1 };
}

/** The key the next message of this party uses, with the state after the step (no sealing). */
export async function deriveSendKey<S, Priv, Pub, D, C>(
  alg: Algebra<S, Priv, Pub, D, C>, st: PartyState<S, Priv, Pub>,
): Promise<{ state: PartyState<S, Priv, Pub>; header: Header<Pub>; mk: S }> {
  const s = st.cks === null ? await sendStep(alg, st) : st;
  const { mk, ck } = await alg.kdfCk(s.cks!);
  return { state: { ...s, cks: ck, ns: s.ns + 1 }, header: { pub: s.pub, n: s.ns }, mk };
}

export async function send<S, Priv, Pub, D, C>(alg: Algebra<S, Priv, Pub, D, C>, st: PartyState<S, Priv, Pub>, text: string): Promise<Sent<S, Priv, Pub, C>> {
  const { state, header, mk } = await deriveSendKey(alg, st);
  return { state, header, sealed: await alg.seal(mk, header, text), mk };
}

/** A header with a new ratchet key triggers the DH step: a new receiving chain, then a fresh key pair and a new sending chain. */
export async function receive<S, Priv, Pub, D, C>(
  alg: Algebra<S, Priv, Pub, D, C>, st: PartyState<S, Priv, Pub>, header: Header<Pub>, sealed: C, mode: RatchetMode,
): Promise<Received<S, Priv, Pub>> {
  let s = st;
  if (mode === 'full' && !alg.samePub(header.pub, s.remote)) {
    const first = await alg.kdfRk(s.rk!, await alg.dh(s.priv, header.pub));
    const fresh = await alg.keyPair(s.party, s.made);
    const second = await alg.kdfRk(first.rk, await alg.dh(fresh.priv, header.pub));
    s = { ...s, rk: second.rk, ckr: first.ck, cks: second.ck, priv: fresh.priv, pub: fresh.pub, remote: header.pub, ns: 0, nr: 0, made: s.made + 1 };
  }
  const { mk, ck } = await alg.kdfCk(s.ckr!);
  return { state: { ...s, ckr: ck, nr: s.nr + 1 }, text: await alg.open(mk, header, sealed), mk };
}

export interface Message<Pub, C, S> {
  /** 0-based position in the conversation. */
  index: number;
  sender: Party;
  header: Header<Pub>;
  sealed: C;
  text: string;
  /** The message key the sender used (the receiver derives the same value). */
  mk: S;
  /** The sender's chain key after this message. */
  ckAfter: S;
}

export interface Run<S, Priv, Pub, C> {
  messages: Message<Pub, C, S>[];
  /** after[i] is both parties' states once message i has been sent and received. */
  after: Pair<S, Priv, Pub>[];
  start: Pair<S, Priv, Pub>;
}

/** Runs a conversation: each message is sent by its sender and received by the other party at once (no loss, no reordering). */
export async function runConversation<S, Priv, Pub, D, C>(
  alg: Algebra<S, Priv, Pub, D, C>, pattern: readonly Party[], texts: readonly string[], mode: RatchetMode, onMessage?: (index: number) => void,
): Promise<Run<S, Priv, Pub, C>> {
  const start = await initParties(alg, mode);
  let states = start;
  const messages: Message<Pub, C, S>[] = [];
  const after: Pair<S, Priv, Pub>[] = [];
  for (let index = 0; index < pattern.length; index++) {
    const sender = pattern[index];
    const sent = await send(alg, states[sender], texts[index]);
    const got = await receive(alg, states[other(sender)], sent.header, sent.sealed, mode);
    states = { ...states, [sender]: sent.state, [other(sender)]: got.state } as Pair<S, Priv, Pub>;
    messages.push({ index, sender, header: sent.header, sealed: sent.sealed, text: texts[index], mk: sent.mk, ckAfter: sent.state.cks! });
    after.push(states);
    onMessage?.(index);
  }
  return { messages, after, start };
}

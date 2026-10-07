import type { ReactNode } from 'react';
import type { SequenceMessage } from '../../components/SequenceDiagram';
import { superscript } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { EVE_SECRETS, type BruteForce, type DhParams, type Exchange } from './model';

export const group = (v: bigint | number) => v.toLocaleString('en-US');
const pow = (base: bigint, exp: bigint) => `${group(base)}${superscript(Number(exp))}`;
const lock = '🔒';

// ── Paint ───────────────────────────────────────────────────────────

export interface PaintFrame extends Frame {
  /** 0 base agreed · 1 private paints · 2 mixtures sent · 3 own paint added · 4 compared. */
  stage: number;
}

export function paintFrames(alice: string, bob: string): PaintFrame[] {
  const r = createRecorder<PaintFrame>({ stage: 0 });
  r.snap(<>Alice and Bob agree in public on a base paint, <span className="hl amber">amber</span>. Eve, on the wire, sees it.</>);
  r.snap(<>Each picks a private paint that never leaves them {lock}: Alice {alice}, Bob {bob}. Each mixes it into the base.</>, 1, { stage: 1 });
  r.snap(<>They swap the mixtures across the wire. Eve now has <span className="hl orange">the base and both mixtures</span>, and
    that's all she ever gets.</>, 1.2, { stage: 2 });
  r.snap(<>Each adds their own private paint to the mixture they received.</>, 1, { stage: 3 });
  r.set({ stage: 4 });
  r.close(<>The same colour on both sides: amber, {alice} and {bob} in equal parts, mixed in a different order.{' '}
    <span className="hl orange">Eve's best try</span>, mixing her two mixtures, has too much amber. Un-mixing paint is the hard
    part; in the maths it's the discrete logarithm.</>, 2.4);
  return r.frames;
}

// ── Numbers ─────────────────────────────────────────────────────────

export interface NumFrame extends Frame {
  /** Index of the current message in the diagram; −1 before the first. */
  step: number;
  done: boolean;
}

/** The ladder diagram's messages, built from the computed exchange. */
export function messagesFor({ p, g, a, b }: DhParams, x: Exchange): SequenceMessage[] {
  const pg: SequenceMessage = { id: 'pg', from: 'alice', to: 'bob', label: `p = ${group(p)}, g = ${group(g)}`, tone: 'info' };
  const pickA: SequenceMessage = { id: 'a', from: 'alice', to: 'alice', label: `a = ${group(a)} ${lock}`, tone: 'violet' };
  const pickB: SequenceMessage = { id: 'b', from: 'bob', to: 'bob', label: `b = ${group(b)} ${lock}`, tone: 'violet' };
  if (!x.mitm) {
    return [
      pg, pickA, pickB,
      { id: 'A', from: 'alice', to: 'bob', label: `A = ${pow(g, a)} mod ${group(p)} = ${group(x.A)}`, tone: 'info' },
      { id: 'B', from: 'bob', to: 'alice', label: `B = ${pow(g, b)} mod ${group(p)} = ${group(x.B)}`, tone: 'info' },
      { id: 'sa', from: 'alice', to: 'alice', label: `s = ${pow(x.B, a)} mod ${group(p)} = ${group(x.sAlice)}`, tone: 'ok' },
      { id: 'sb', from: 'bob', to: 'bob', label: `s = ${pow(x.A, b)} mod ${group(p)} = ${group(x.sBob)}`, tone: 'ok' },
    ];
  }
  const { E1, E2 } = x.mitm;
  return [
    pg, pickA, pickB,
    { id: 'A', from: 'alice', to: 'eve', label: `A = ${group(x.A)}`, tone: 'info' },
    { id: 'E1', from: 'eve', to: 'bob', label: `"A" = ${pow(g, EVE_SECRETS.toBob)} mod ${group(p)} = ${group(E1)}`, tone: 'orange' },
    { id: 'B', from: 'bob', to: 'eve', label: `B = ${group(x.B)}`, tone: 'info' },
    { id: 'E2', from: 'eve', to: 'alice', label: `"B" = ${pow(g, EVE_SECRETS.toAlice)} mod ${group(p)} = ${group(E2)}`, tone: 'orange' },
    { id: 'sa', from: 'alice', to: 'alice', label: `s = ${pow(E2, a)} mod ${group(p)} = ${group(x.sAlice)}`, tone: 'bad' },
    { id: 'sb', from: 'bob', to: 'bob', label: `s = ${pow(E1, b)} mod ${group(p)} = ${group(x.sBob)}`, tone: 'bad' },
  ];
}

/** The closing verdict, computed from the two secrets. */
export function verdict(x: Exchange): ReactNode {
  if (!x.mitm) {
    return x.sAlice === x.sBob
      ? <>Shared secret <span className="hl ok">{group(x.sAlice)}</span> on both sides, and it never crossed the wire. Eve has p, g, A
        and B: press "Try every a" to see why toy numbers fall at once.</>
      : <><span className="hl bad">The secrets differ ({group(x.sAlice)} and {group(x.sBob)}).</span></>;
  }
  const link = <>DH alone doesn't prove <i>who</i> you agreed with; that's why TLS signs the exchange with the server's certificate key
    (see Digital Signatures and the TLS handshake).</>;
  if (x.sAlice !== x.sBob) {
    return <>Alice ends up with <span className="hl bad">{group(x.sAlice)}</span> and Bob with <span className="hl bad">{group(x.sBob)}</span>:
      each shares a key with Eve, not with each other, and both exchanges looked fine. {link}</>;
  }
  return <>Both got <span className="hl bad">{group(x.sAlice)}</span>, but only by coincidence in a group this small: each one agreed
    with Eve, who knows that number too. {link}</>;
}

export function numberFrames(params: DhParams, x: Exchange): NumFrame[] {
  const { p, g, a, b } = params;
  const msgs = messagesFor(params, x);
  const r = createRecorder<NumFrame>({ step: -1, done: false });
  const say: Record<string, ReactNode> = {
    pg: <>Alice and Bob agree in public on a prime p = {group(p)} and a base g = {group(g)}. <span className="hl orange">Eve</span>{' '}
      sees them.</>,
    a: <>Alice picks a private <span className="hl violet">a = {group(a)} {lock}</span>. It never leaves her.</>,
    b: <>Bob picks a private <span className="hl violet">b = {group(b)} {lock}</span>.</>,
    A: x.mitm
      ? <>Alice sends A = {pow(g, a)} mod {group(p)} = {group(x.A)}. This time Eve doesn't just watch: she keeps it.</>
      : <>Alice sends <span className="hl info">A = gᵃ mod p = {group(x.A)}</span>. Eve sees {group(x.A)}, but getting a back from it is
        the hard part: the discrete logarithm.</>,
    B: x.mitm
      ? <>Bob sends B = {group(x.B)}, and Eve keeps that too.</>
      : <>Bob sends <span className="hl info">B = gᵇ mod p = {group(x.B)}</span>.</>,
    E1: <>Eve sends Bob <span className="hl orange">her own value, {group(x.mitm?.E1 ?? 0n)}</span>, in place of Alice's. Nothing in a bare
      number says who sent it.</>,
    E2: <>…and sends Alice <span className="hl orange">her own {group(x.mitm?.E2 ?? 0n)}</span> in place of Bob's.</>,
    sa: x.mitm
      ? <>Alice computes s from the value she received: {group(x.sAlice)}. She thinks it's shared with Bob.</>
      : <>Alice raises B to her a: s = {pow(x.B, a)} mod {group(p)} = <span className="hl ok">{group(x.sAlice)}</span>.</>,
    sb: x.mitm
      ? <>Bob computes {group(x.sBob)} from Eve's value. He thinks it's shared with Alice.</>
      : <>Bob raises A to his b: {pow(x.A, b)} mod {group(p)} = <span className="hl ok">{group(x.sBob)}</span>. Same number, because
        (gᵇ)ᵃ = (gᵃ)ᵇ = gᵃᵇ.</>,
  };
  msgs.forEach((m, i) => r.snap(say[m.id], 1, { step: i }));
  r.set({ done: true });
  r.close(verdict(x), 2.6);
  return r.frames;
}

/** Which public values Eve has seen by message `step`. */
export function eveSees(msgs: readonly SequenceMessage[], step: number): string[] {
  return msgs.slice(0, step + 1).filter((m) => m.tone === 'info').map((m) => m.label);
}

export function bruteCaption(p: bigint, a: bigint, eve: BruteForce, shared: bigint): ReactNode {
  const same = eve.found === a ? <>That's Alice's a.</> : <>That isn't Alice's a = {group(a)}, but g makes the same A from both, so it
    works just as well.</>;
  return <>Eve tried x = 1, 2, 3 … and hit gˣ ≡ A at x = <span className="hl orange">{group(eve.found)}</span> after {group(eve.tries)}{' '}
    {eve.tries === 1 ? 'try' : 'tries'}. {same} Then Bˣ mod {group(p)} = <span className="hl orange">{group(eve.secret)}</span>
    {eve.secret === shared ? <>: the shared secret. Toy numbers fall instantly.</> : '.'}</>;
}

// ── Real ECDH ───────────────────────────────────────────────────────

export function realCaption(state: 'pending' | 'equal' | 'different'): ReactNode {
  if (state === 'pending') return <>Generating two real P-256 key pairs in your browser…</>;
  if (state === 'different') return <><span className="hl bad">The two derived secrets differ.</span></>;
  return <>Alice and Bob each derived the same <span className="hl ok">256-bit secret</span>, byte for byte, from their own private
    key and the other's public key. Only the two public keys crossed the wire.</>;
}

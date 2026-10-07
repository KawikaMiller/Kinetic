import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { REASON_TEXT, type Cert, type Scenario, type Validation } from './pki';

export const HONESTY = 'Real ECDSA signatures in your browser; the certificates are simplified stand-ins, not X.509, and the trust store is simulated. All names are fictional.';

export type NodeStatus = 'unchecked' | 'checking' | 'ok' | 'bad';

/** One card in the chain drawing, top (root) first. */
export interface ChainNode {
  id: string;
  cert: Cert | null;
  /** Index in the presented chain, or null for the trust-store root or a missing certificate. */
  chainIndex: number | null;
  kind: 'presented' | 'anchor' | 'missing';
}

export function chainNodes(s: Scenario): ChainNode[] {
  const presented: ChainNode[] = s.chain.map((cert, i) => ({ id: `c${i}`, cert, chainIndex: i, kind: 'presented' as const })).reverse();
  const top = s.chain.at(-1)!;
  if (top.issuer === top.subject) return presented;
  const anchor = s.store[0];
  const missing: ChainNode[] = s.missing ? [{ id: 'missing', cert: null, chainIndex: null, kind: 'missing' }] : [];
  return [{ id: 'anchor', cert: anchor, chainIndex: null, kind: 'anchor' }, ...missing, ...presented];
}

export interface ChainFrame extends Frame {
  /** How many checks have run (the last of them is current). */
  shown: number;
  done: boolean;
}

/** Each node's status after `shown` checks: computed from the checks, never from the preset. */
export function statuses(nodes: readonly ChainNode[], v: Validation, shown: number, done: boolean): Record<string, NodeStatus> {
  const run = v.checks.slice(0, shown);
  const current = run.at(-1);
  const out: Record<string, NodeStatus> = {};
  for (const n of nodes) {
    if (n.chainIndex === null) {
      const trusted = n.kind === 'anchor' && run.some((c) => c.id === 'trust' && c.ok);
      const missingHit = n.kind === 'missing' && run.some((c) => c.reason === 'missing-issuer');
      out[n.id] = trusted ? 'ok' : missingHit ? 'bad' : 'unchecked';
      continue;
    }
    const mine = run.filter((c) => c.cert === n.chainIndex);
    if (mine.some((c) => !c.ok)) out[n.id] = 'bad';
    else if (mine.length === 0) out[n.id] = 'unchecked';
    else if (current && current.cert === n.chainIndex && !done) out[n.id] = 'checking';
    else out[n.id] = 'ok';
  }
  return out;
}

const CHECK_NAME = { dates: 'Dates', name: 'Name', issuer: 'Issuer', signature: 'Signature', ca: 'CA flag', trust: 'Trust' } as const;

export function verdict(s: Scenario, v: Validation): ReactNode {
  if (v.reason === null) {
    const path = [...s.chain.map((c) => c.subject), s.store[0].subject].filter((x, i, a) => a.indexOf(x) === i);
    return <><span className="hl ok">Chain valid</span> for {s.host}: {path.join(' ← vouched for by ')}, which is in your trust store.</>;
  }
  const extra: Partial<Record<NonNullable<Validation['reason']>, ReactNode>> = {
    'self-signed': <> The signature itself is fine; trust is the problem.</>,
    'missing-issuer': <> Some browsers fetch or cache a missing intermediate, so this can work on one machine and fail on another. The
      fix: the server sends the full chain.</>,
    'unknown-root': <> Every signature checked out; the chain just ends somewhere you never chose to trust.</>,
    'name-mismatch': <> {s.host} needs its own name on the certificate, or a wildcard like *.{s.chain[0].names[0]}.</>,
  };
  return <><span className="hl bad">Rejected: {REASON_TEXT[v.reason]}.</span>{extra[v.reason]}</>;
}

export function chainFrames(s: Scenario, v: Validation): ChainFrame[] {
  const r = createRecorder<ChainFrame>({ shown: 0, done: false });
  r.snap(s.chain.length === 1
    ? <>The server for {s.host} presents one certificate. The browser checks it, then looks for who vouches for it.</>
    : <>The server for {s.host} presents {s.chain.length} certificates. The browser checks them from the leaf upward.</>);
  v.checks.forEach((c, i) => {
    const who = s.chain[c.cert].subject;
    r.snap(<>{CHECK_NAME[c.id]} on <b>{who}</b>: <span className={c.ok ? 'hl ok' : 'hl bad'}>{c.detail}</span>.</>, c.ok ? 1 : 1.6, { shown: i + 1 });
  });
  r.set({ done: true });
  r.close(verdict(s, v), 2.4);
  return r.frames;
}

export function signCaption(state: 'unsigned' | 'valid' | 'note-edited' | 'sig-edited' | 'both'): ReactNode {
  switch (state) {
    case 'unsigned':
      return <>Press Sign: the private key 🔒 signs the note, and anyone with the public key can check it.</>;
    case 'valid':
      return <><span className="hl ok">Signature valid</span>: this exact note was signed by the holder of the private key.</>;
    case 'note-edited':
      return <><span className="hl bad">Signature invalid</span>: the note changed after signing, so the signature no longer matches it.</>;
    case 'sig-edited':
      return <><span className="hl bad">Signature invalid</span>: a byte of the signature was changed.</>;
    default:
      return <><span className="hl bad">Signature invalid</span>: both the note and the signature changed.</>;
  }
}

import type { ReactNode } from 'react';
import type { SequenceActor, SequenceMessage } from '../../components/SequenceDiagram';
import type { Frame } from '../../core/types';
import { LOOKALIKE_ORIGIN, REAL_ORIGIN, type PasskeyProof } from './passkey';

export type Method = 'totp' | 'passkey';
export type Site = 'real' | 'lookalike';

export const REAL_HOST = REAL_ORIGIN.replace('https://', '');
export const LOOKALIKE_HOST = LOOKALIKE_ORIGIN.replace('https://', '');

export const ACTORS: SequenceActor[] = [
  { id: 'you', label: 'You (browser)', tone: 'info' },
  { id: 'device', label: 'Phone / key' },
  { id: 'real', label: REAL_HOST },
  { id: 'fake', label: LOOKALIKE_HOST, tone: 'orange' },
];

export type Who = 'you' | 'attacker' | 'nobody';

/** Who ends up signed in as you at the real site. */
export function whoGetsIn(method: Method, site: Site): Who {
  if (site === 'real') return 'you';
  return method === 'totp' ? 'attacker' : 'nobody';
}

export interface PhishFrame extends Frame {
  step: number;
}

const short = (proof: PasskeyProof | null) => (proof ? `${proof.signatureHex.slice(0, 8)}…` : '…');

export function ladder(method: Method, site: Site, proof: PasskeyProof | null): SequenceMessage[] {
  const visit: SequenceMessage[] = site === 'lookalike'
    ? [
        { id: 'link', from: 'you', to: 'fake', label: 'open a link from a message', tone: 'info' },
        { id: 'page', from: 'fake', to: 'you', label: 'page that looks the same', tone: 'orange' },
      ]
    : [];
  if (method === 'totp') {
    const tail: SequenceMessage[] = site === 'real'
      ? [
          { id: 'submit', from: 'you', to: 'real', label: 'password + 6-digit code', tone: 'info' },
          { id: 'result', from: 'real', to: 'you', label: 'accepted: signed in', tone: 'ok' },
        ]
      : [
          { id: 'submit', from: 'you', to: 'fake', label: 'password + 6-digit code', tone: 'info' },
          { id: 'relay', from: 'fake', to: 'real', label: 'the same password + code', tone: 'orange', note: 'passed on within the 30 seconds' },
          { id: 'result', from: 'real', to: 'fake', label: 'accepted: signed in as you', tone: 'bad' },
        ];
    return [...visit, { id: 'code', from: 'device', to: 'you', label: 'shows a code', tone: 'info', note: 'changes every 30 s' }, ...tail];
  }
  if (site === 'real') {
    return [
      { id: 'start', from: 'you', to: 'real', label: 'sign in', tone: 'info' },
      { id: 'challenge', from: 'real', to: 'you', label: 'a fresh challenge', tone: 'info' },
      { id: 'sign', from: 'you', to: 'device', label: `sign (challenge, ${REAL_HOST})`, tone: 'info', note: 'the origin comes from the browser' },
      { id: 'signature', from: 'device', to: 'you', label: `signature ${short(proof)}`, tone: 'violet' },
      { id: 'submit', from: 'you', to: 'real', label: 'the signature', tone: 'info' },
      { id: 'result', from: 'real', to: 'you', label: `verified for ${REAL_HOST}: signed in`, tone: 'ok' },
    ];
  }
  return [
    ...visit,
    { id: 'challenge', from: 'fake', to: 'you', label: 'a challenge', tone: 'orange' },
    { id: 'sign', from: 'you', to: 'device', label: `sign (challenge, ${LOOKALIKE_HOST})`, tone: 'info', note: 'the origin comes from the browser' },
    { id: 'none', from: 'device', to: 'you', label: 'no passkey for this site', tone: 'ok', note: 'nothing to sign, nothing to pass on' },
  ];
}

export function stepCaption(method: Method, site: Site, id: string, proof: PasskeyProof | null): ReactNode {
  switch (id) {
    case 'link':
      return <>You follow a link in a message to a site on <span className="hl orange">{LOOKALIKE_HOST}</span>, a look-alike of the real {REAL_HOST}.</>;
    case 'page':
      return <>The look-alike page copies the real sign-in page. Nothing on screen reveals the difference except the address.</>;
    case 'code':
      return <>Your authenticator shows a 6-digit code. It is just digits you can read and type, and it is valid for about 30 seconds.</>;
    case 'submit':
      return method === 'totp'
        ? site === 'real'
          ? <>You type your password and the code into the real site.</>
          : <>You type your password and the code into the look-alike, which cannot tell them from the real thing.</>
        : <>The browser sends the signature to {REAL_HOST}.</>;
    case 'relay':
      return <><span className="hl orange">Anything you can type, a fake site can pass on</span> within the 30 seconds. That is why a code, an SMS or a push approval is phishable.</>;
    case 'start':
      return <>You ask {REAL_HOST} to sign you in with your passkey.</>;
    case 'challenge':
      return <>{site === 'real' ? REAL_HOST : LOOKALIKE_HOST} sends a random challenge to sign.</>;
    case 'sign':
      return <>The browser asks your authenticator to sign the challenge for the origin <b>{site === 'real' ? REAL_HOST : LOOKALIKE_HOST}</b>. The origin comes from the browser, not from the page, so the page cannot choose it.</>;
    case 'signature':
      return <>The authenticator signs (challenge, origin) with the private key it made for {REAL_HOST}: a real ECDSA signature, {proof ? `${proof.signature.length} bytes` : 'computing'}.</>;
    case 'none':
      return <><span className="hl ok">The authenticator has no credential for {LOOKALIKE_HOST}</span>, so it offers nothing. There is no signature to pass on, and a signature made for the real site would not verify here.</>;
    default:
      if (method === 'totp') {
        return site === 'real'
          ? <><span className="hl ok">Accepted.</span> The server computed the same code from the shared secret and the clock.</>
          : <><span className="hl bad">Accepted: signed in as you.</span> The server saw a correct password and a correct code. With only phishable factors, a look-alike site gets all of it.</>;
      }
      return <><span className="hl ok">Verified.</span> The signature covers this server&apos;s own challenge and origin, and checks out against the public key it holds.</>;
  }
}

export function frames(method: Method, site: Site, proof: PasskeyProof | null): PhishFrame[] {
  return ladder(method, site, proof).map((m, step) => ({ step, say: stepCaption(method, site, m.id, proof) }));
}

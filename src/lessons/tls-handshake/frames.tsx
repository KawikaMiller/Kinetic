import { TOKENS } from '../../core/palette';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';

export interface Paint {
  color: string;
  label: string;
  secret?: boolean;
  mixed?: boolean;
}

// Paint-mixing Diffie-Hellman: mixing is easy, un-mixing is (practically) impossible.
// The mixes are real colour blends, so they have no token.
export const P = {
  pub: { color: TOKENS.hi, label: 'public yellow' },
  cSec: { color: TOKENS.bad, label: 'secret red', secret: true },
  sSec: { color: TOKENS.info, label: 'secret blue', secret: true },
  mSec: { color: TOKENS.violet, label: 'secret violet', secret: true },
  cMix: { color: '#ff9a5c', label: 'yellow + red', mixed: true },
  sMix: { color: '#8fd694', label: 'yellow + blue', mixed: true },
  mMix: { color: '#e0a8d8', label: 'yellow + violet', mixed: true },
  shared: { color: '#b07a4f', label: 'shared secret', mixed: true },
  sharedM: { color: '#c46f86', label: 'shared… with Mallory', mixed: true },
} satisfies Record<string, Paint>;

export type Party = 'client' | 'server' | 'mallory';

export interface Wire {
  label: string;
  from: Party;
  to: Party;
  color: string;
  cipher?: boolean;
}

interface Note {
  text: string;
  color?: string;
  cipher?: boolean;
}

type LinkState = 'pending' | 'ok' | 'bad';
interface ChainLink {
  name: string;
  detail: string;
  state: LinkState;
}

export interface TlsFrame extends Frame {
  wire: Wire | null;
  client: Paint[];
  server: Paint[];
  mallory: Paint[];
  clientKey: Paint | null;
  serverKey: Paint | null;
  notes: Note[];
  chain: ChainLink[] | null;
  locked: boolean;
  aborted: boolean;
  rtt: number;
}

const GIBBERISH = ['9f 2a c4 e1 07 b8 5d…', '3c 88 f0 1a 6e 92 d4…', 'b1 07 5e 2f c9 aa 60…'];

/** A message is on the wire for exactly one frame. */
function recorder() {
  return createRecorder<TlsFrame>(
    {
      wire: null, client: [], server: [], mallory: [], clientKey: null, serverKey: null, notes: [], chain: null,
      locked: false, aborted: false, rtt: 0,
    },
    { transient: { wire: null } },
  );
}

export function normalFrames(): TlsFrame[] {
  const r = recorder();
  const notes = () => r.get().notes;
  // mark link i on top of whatever the previous frame had verified
  const mark = (i: number, state: LinkState) => r.get().chain!.map((l, j) => (j === i ? { ...l, state } : l));

  r.snap(<>The client and server want a shared secret key, but <b>Eve</b> can read every byte on the wire. How do you agree on a secret in public?</>);
  r.snap(
    <>Both sides start from the same <span className="hl">public</span> colour. Everyone knows it, Eve included. (In real TLS: a public elliptic curve.)</>,
    undefined,
    { client: [P.pub], server: [P.pub], notes: [{ text: 'public colour: yellow', color: P.pub.color }] },
  );
  r.snap(
    <>Each side picks a <b>secret</b> colour and keeps it. These never leave their owner. Not once.</>,
    undefined,
    { client: [P.pub, P.cSec], server: [P.pub, P.sSec] },
  );
  r.snap(
    <>The client mixes public + its secret. Mixing is easy; <b>un-mixing is practically impossible</b>. That one-way step is the whole trick.</>,
    undefined,
    { client: [P.pub, P.cSec, P.cMix] },
  );
  r.snap(
    <><span className="hl info">ClientHello</span>: "I speak TLS 1.3, here are my ciphers, and here's my <b>mixed</b> colour." Eve writes it down.</>,
    undefined,
    {
      wire: { label: 'ClientHello + key share', from: 'client', to: 'server', color: P.cMix.color },
      server: [P.pub, P.sSec, P.cMix], notes: [...notes(), { text: 'client key share: yellow + red mix', color: P.cMix.color }],
    },
  );
  r.snap(
    <><span className="hl info">ServerHello</span>: the server mixes its own and sends it back. Eve now has <b>three</b> colours… but no secrets.</>,
    undefined,
    {
      wire: { label: 'ServerHello + key share', from: 'server', to: 'client', color: P.sMix.color },
      server: [P.pub, P.sSec, P.cMix, P.sMix], client: [P.pub, P.cSec, P.cMix, P.sMix],
      notes: [...notes(), { text: 'server key share: yellow + blue mix', color: P.sMix.color }], rtt: 1,
    },
  );
  r.snap(
    <>
      Each side adds <b>its own secret</b> to the other's mix. Both end up with the <span className="hl">same</span> colour, and it
      never crossed the wire. Eve can't make it without a secret.
    </>,
    1.6,
    { clientKey: P.shared, serverKey: P.shared },
  );
  r.snap(
    <>
      But <i>who</i> did we just agree a key with? The server sends its <b>certificate</b>, plus a signature proving it holds the
      matching private key. (In TLS 1.3 this rides in the same flight as ServerHello, already encrypted.)
    </>,
    undefined,
    {
      wire: { label: 'Certificate + CertificateVerify', from: 'server', to: 'client', color: 'var(--violet)', cipher: true },
      notes: [...notes(), { text: 'certificate (already encrypted)', cipher: true }],
      chain: [
        { name: 'api.example.com', detail: 'issued by Example Intermediate CA', state: 'pending' },
        { name: 'Example Intermediate CA', detail: 'issued by Example Root CA', state: 'pending' },
        { name: 'Example Root CA', detail: 'in your trust store?', state: 'pending' },
      ],
    },
  );
  r.snap(
    <>Check 1: the name matches <span className="hl">api.example.com</span>, it hasn't expired, and the intermediate CA's signature on it is valid.</>,
    undefined,
    { chain: mark(0, 'ok') },
  );
  r.snap(<>Check 2: the intermediate's certificate is signed by the root.</>, undefined, { chain: mark(1, 'ok') });
  r.snap(
    <>Check 3: that root is in the browser's built-in <span className="hl ok">trust store</span>. The chain holds: this really is the server.</>,
    undefined,
    { chain: mark(2, 'ok') },
  );
  r.snap(
    <>Both sides confirm with <b>Finished</b> messages and derive session keys. <span className="hl ok">Secure after 1 round trip</span> (TLS 1.2 needed 2).</>,
    undefined,
    {
      wire: { label: 'Finished', from: 'client', to: 'server', color: 'var(--ok)', cipher: true },
      locked: true, notes: [...notes(), { text: 'Finished (encrypted)', cipher: true }],
    },
  );
  r.snap(
    <>Now real data flows, encrypted with fast <b>symmetric</b> encryption (like AES) using that shared key. Eve sees only noise.</>,
    undefined,
    {
      wire: { label: 'GET /account', from: 'client', to: 'server', color: P.shared.color, cipher: true },
      notes: [...notes(), { text: GIBBERISH[0], cipher: true }],
    },
  );
  r.snap(
    <>
      Recap: <b>key exchange</b> made a shared secret in public, the <b>certificate chain</b> proved who's on the other end, and{' '}
      <b>symmetric encryption</b> protects the data. Eve got nothing useful.
    </>,
    2.2,
    {
      wire: { label: '200 OK · your balance', from: 'server', to: 'client', color: P.shared.color, cipher: true },
      notes: [...notes(), { text: GIBBERISH[1], cipher: true }],
    },
  );
  return r.frames;
}

export function mitmFrames(): TlsFrame[] {
  const r = recorder();
  const notes = () => r.get().notes;

  r.snap(<><b>Mallory</b> controls the café Wi-Fi. She doesn't just listen: she can intercept and <i>replace</i> messages. Can she fool the client?</>);
  r.snap(
    <>Same start: public yellow, and each party has a secret. Mallory has her own secret too.</>,
    undefined,
    { client: [P.pub, P.cSec], mallory: [P.pub, P.mSec], server: [P.pub, P.sSec] },
  );
  r.snap(
    <>The ClientHello never reaches the server. <span className="hl bad">Mallory grabs it.</span></>,
    undefined,
    {
      client: [P.pub, P.cSec, P.cMix],
      wire: { label: 'ClientHello + key share', from: 'client', to: 'mallory', color: P.cMix.color },
      mallory: [P.pub, P.mSec, P.cMix], notes: [{ text: 'intercepted ClientHello', color: P.cMix.color }],
    },
  );
  r.snap(
    <>She answers <i>pretending to be the server</i>, with her own mixed colour.</>,
    undefined,
    {
      wire: { label: 'ServerHello + key share', from: 'mallory', to: 'client', color: P.mMix.color },
      mallory: [P.pub, P.mSec, P.cMix, P.mMix], client: [P.pub, P.cSec, P.cMix, P.mMix], rtt: 1,
      notes: [...notes(), { text: 'sent her OWN key share', color: P.mMix.color }],
    },
  );
  r.snap(
    <>
      The client and Mallory now share a key. <b>Key exchange alone can't tell you who's on the other end</b>: it happily agreed a
      secret with the attacker.
    </>,
    1.6,
    { clientKey: P.sharedM, notes: [...notes(), { text: 'now shares a key with the client!', color: P.sharedM.color }] },
  );
  r.snap(
    <>So Mallory needs a certificate for api.example.com. No real CA will sign one for her, so she <b>signs it herself</b>.</>,
    undefined,
    {
      wire: { label: 'Certificate (forged)', from: 'mallory', to: 'client', color: 'var(--bad)', cipher: true },
      chain: [
        { name: 'api.example.com', detail: 'issued by Mallory CA', state: 'pending' },
        { name: 'Mallory CA', detail: 'in your trust store?', state: 'pending' },
      ],
    },
  );
  r.snap(<>The name on it looks right…</>, undefined, {
    chain: [
      { name: 'api.example.com', detail: 'issued by Mallory CA', state: 'ok' },
      { name: 'Mallory CA', detail: 'in your trust store?', state: 'pending' },
    ],
  });
  r.snap(
    <>…but the chain ends at <span className="hl bad">Mallory CA</span>, which the browser has never heard of. <b>Verification fails.</b></>,
    undefined,
    {
      chain: [
        { name: 'api.example.com', detail: 'issued by Mallory CA', state: 'ok' },
        { name: 'Mallory CA', detail: 'NOT in your trust store', state: 'bad' },
      ],
    },
  );
  r.snap(
    <>
      The client <span className="hl bad">aborts</span> before sending a single byte of real data ("Your connection is not private").
      Encryption stops eavesdroppers; <b>certificates stop impostors</b>.
    </>,
    2.2,
    {
      wire: { label: 'alert: bad_certificate', from: 'client', to: 'mallory', color: 'var(--bad)' },
      aborted: true, clientKey: null,
      notes: [...notes(), { text: 'got an alert. No data. Game over.', color: 'var(--bad)' }],
    },
  );
  return r.frames;
}

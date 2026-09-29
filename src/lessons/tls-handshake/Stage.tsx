import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

// Paint-mixing Diffie-Hellman: mixing is easy, un-mixing is (practically) impossible.
const P = {
  pub: { color: '#ffd166', label: 'public yellow' },
  cSec: { color: '#ff5d6c', label: 'secret red', secret: true },
  sSec: { color: '#4cc9f0', label: 'secret blue', secret: true },
  mSec: { color: '#a78bfa', label: 'secret violet', secret: true },
  cMix: { color: '#ff9a5c', label: 'yellow + red', mixed: true },
  sMix: { color: '#8fd694', label: 'yellow + blue', mixed: true },
  mMix: { color: '#e0a8d8', label: 'yellow + violet', mixed: true },
  shared: { color: '#b07a4f', label: 'shared secret', mixed: true },
  sharedM: { color: '#c46f86', label: 'shared… with Mallory', mixed: true },
} satisfies Record<string, Paint>;

interface Paint {
  color: string;
  label: string;
  secret?: boolean;
  mixed?: boolean;
}

type Party = 'client' | 'server' | 'mallory';

interface Wire {
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

interface TlsFrame extends Frame {
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

function normalFrames(): TlsFrame[] {
  const f: TlsFrame[] = [];
  let s: TlsFrame = {
    wire: null, client: [], server: [], mallory: [], clientKey: null, serverKey: null, notes: [], chain: null,
    locked: false, aborted: false, rtt: 0,
    say: <>The client and server want a shared secret key, but <b>Eve</b> can read every byte on the wire. How do you agree on a secret in public?</>,
  };
  const push = (patch: Partial<TlsFrame>) => {
    s = { ...s, wire: null, hold: 1, ...patch };
    f.push(s);
  };
  push({});
  push({
    client: [P.pub], server: [P.pub], notes: [{ text: 'public colour: yellow', color: P.pub.color }],
    say: <>Both sides start from the same <span className="hl">public</span> colour. Everyone knows it, Eve included. (In real TLS: a public elliptic curve.)</>,
  });
  push({
    client: [P.pub, P.cSec], server: [P.pub, P.sSec],
    say: <>Each side picks a <b>secret</b> colour and keeps it. These never leave their owner. Not once.</>,
  });
  push({
    client: [P.pub, P.cSec, P.cMix],
    say: <>The client mixes public + its secret. Mixing is easy; <b>un-mixing is practically impossible</b>. That one-way step is the whole trick.</>,
  });
  push({
    wire: { label: 'ClientHello + key share', from: 'client', to: 'server', color: P.cMix.color },
    server: [P.pub, P.sSec, P.cMix], notes: [...s.notes, { text: 'client key share: yellow + red mix', color: P.cMix.color }],
    say: <><span className="hl info">ClientHello</span>: "I speak TLS 1.3, here are my ciphers, and here's my <b>mixed</b> colour." Eve writes it down.</>,
  });
  push({
    wire: { label: 'ServerHello + key share', from: 'server', to: 'client', color: P.sMix.color },
    server: [P.pub, P.sSec, P.cMix, P.sMix], client: [P.pub, P.cSec, P.cMix, P.sMix],
    notes: [...s.notes, { text: 'server key share: yellow + blue mix', color: P.sMix.color }], rtt: 1,
    say: <><span className="hl info">ServerHello</span>: the server mixes its own and sends it back. Eve now has <b>three</b> colours… but no secrets.</>,
  });
  push({
    clientKey: P.shared, serverKey: P.shared,
    say: (
      <>
        Each side adds <b>its own secret</b> to the other's mix. Both end up with the <span className="hl">same</span> colour, and it
        never crossed the wire. Eve can't make it without a secret.
      </>
    ),
    hold: 1.6,
  });
  push({
    wire: { label: 'Certificate + CertificateVerify', from: 'server', to: 'client', color: 'var(--violet)', cipher: true },
    notes: [...s.notes, { text: 'certificate (already encrypted)', cipher: true }],
    chain: [
      { name: 'api.example.com', detail: 'issued by Example Intermediate CA', state: 'pending' },
      { name: 'Example Intermediate CA', detail: 'issued by Example Root CA', state: 'pending' },
      { name: 'Example Root CA', detail: 'in your trust store?', state: 'pending' },
    ],
    say: (
      <>
        But <i>who</i> did we just agree a key with? The server sends its <b>certificate</b>, plus a signature proving it holds the
        matching private key. (In TLS 1.3 this rides in the same flight as ServerHello, already encrypted.)
      </>
    ),
  });
  // mark link i on top of whatever the previous frame had verified
  const mark = (i: number, state: LinkState) => s.chain!.map((l, j) => (j === i ? { ...l, state } : l));
  push({
    chain: mark(0, 'ok'),
    say: <>Check 1: the name matches <span className="hl">api.example.com</span>, it hasn't expired, and the intermediate CA's signature on it is valid.</>,
  });
  push({ chain: mark(1, 'ok'), say: <>Check 2: the intermediate's certificate is signed by the root.</> });
  push({
    chain: mark(2, 'ok'),
    say: <>Check 3: that root is in the browser's built-in <span className="hl ok">trust store</span>. The chain holds: this really is the server.</>,
  });
  push({
    wire: { label: 'Finished', from: 'client', to: 'server', color: 'var(--ok)', cipher: true },
    locked: true, notes: [...s.notes, { text: 'Finished (encrypted)', cipher: true }],
    say: <>Both sides confirm with <b>Finished</b> messages and derive session keys. <span className="hl ok">Secure after 1 round trip</span> (TLS 1.2 needed 2).</>,
  });
  push({
    wire: { label: 'GET /account', from: 'client', to: 'server', color: P.shared.color, cipher: true },
    notes: [...s.notes, { text: GIBBERISH[0], cipher: true }],
    say: <>Now real data flows, encrypted with fast <b>symmetric</b> encryption (like AES) using that shared key. Eve sees only noise.</>,
  });
  push({
    wire: { label: '200 OK · your balance', from: 'server', to: 'client', color: P.shared.color, cipher: true },
    notes: [...s.notes, { text: GIBBERISH[1], cipher: true }],
    hold: 2.2,
    say: (
      <>
        Recap: <b>key exchange</b> made a shared secret in public, the <b>certificate chain</b> proved who's on the other end, and{' '}
        <b>symmetric encryption</b> protects the data. Eve got nothing useful.
      </>
    ),
  });
  return f;
}

function mitmFrames(): TlsFrame[] {
  const f: TlsFrame[] = [];
  let s: TlsFrame = {
    wire: null, client: [], server: [], mallory: [], clientKey: null, serverKey: null, notes: [], chain: null,
    locked: false, aborted: false, rtt: 0,
    say: <><b>Mallory</b> controls the café Wi-Fi. She doesn't just listen: she can intercept and <i>replace</i> messages. Can she fool the client?</>,
  };
  const push = (patch: Partial<TlsFrame>) => {
    s = { ...s, wire: null, hold: 1, ...patch };
    f.push(s);
  };
  push({});
  push({
    client: [P.pub, P.cSec], mallory: [P.pub, P.mSec], server: [P.pub, P.sSec],
    say: <>Same start: public yellow, and each party has a secret. Mallory has her own secret too.</>,
  });
  push({
    client: [P.pub, P.cSec, P.cMix],
    wire: { label: 'ClientHello + key share', from: 'client', to: 'mallory', color: P.cMix.color },
    mallory: [P.pub, P.mSec, P.cMix], notes: [{ text: 'intercepted ClientHello', color: P.cMix.color }],
    say: <>The ClientHello never reaches the server. <span className="hl bad">Mallory grabs it.</span></>,
  });
  push({
    wire: { label: 'ServerHello + key share', from: 'mallory', to: 'client', color: P.mMix.color },
    mallory: [P.pub, P.mSec, P.cMix, P.mMix], client: [P.pub, P.cSec, P.cMix, P.mMix], rtt: 1,
    notes: [...s.notes, { text: 'sent her OWN key share', color: P.mMix.color }],
    say: <>She answers <i>pretending to be the server</i>, with her own mixed colour.</>,
  });
  push({
    clientKey: P.sharedM,
    notes: [...s.notes, { text: 'now shares a key with the client!', color: P.sharedM.color }],
    say: (
      <>
        The client and Mallory now share a key. <b>Key exchange alone can't tell you who's on the other end</b>: it happily agreed a
        secret with the attacker.
      </>
    ),
    hold: 1.6,
  });
  push({
    wire: { label: 'Certificate (forged)', from: 'mallory', to: 'client', color: 'var(--bad)', cipher: true },
    chain: [
      { name: 'api.example.com', detail: 'issued by Mallory CA', state: 'pending' },
      { name: 'Mallory CA', detail: 'in your trust store?', state: 'pending' },
    ],
    say: <>So Mallory needs a certificate for api.example.com. No real CA will sign one for her, so she <b>signs it herself</b>.</>,
  });
  push({
    chain: [
      { name: 'api.example.com', detail: 'issued by Mallory CA', state: 'ok' },
      { name: 'Mallory CA', detail: 'in your trust store?', state: 'pending' },
    ],
    say: <>The name on it looks right…</>,
  });
  push({
    chain: [
      { name: 'api.example.com', detail: 'issued by Mallory CA', state: 'ok' },
      { name: 'Mallory CA', detail: 'NOT in your trust store', state: 'bad' },
    ],
    say: <>…but the chain ends at <span className="hl bad">Mallory CA</span>, which the browser has never heard of. <b>Verification fails.</b></>,
  });
  push({
    wire: { label: 'alert: bad_certificate', from: 'client', to: 'mallory', color: 'var(--bad)' },
    aborted: true, clientKey: null,
    notes: [...s.notes, { text: 'got an alert. No data. Game over.', color: 'var(--bad)' }],
    hold: 2.2,
    say: (
      <>
        The client <span className="hl bad">aborts</span> before sending a single byte of real data ("Your connection is not private").
        Encryption stops eavesdroppers; <b>certificates stop impostors</b>.
      </>
    ),
  });
  return f;
}

export function Stage() {
  const [mode, setMode] = useState<'normal' | 'mitm'>('normal');
  const frames = useMemo(() => (mode === 'normal' ? normalFrames() : mitmFrames()), [mode]);
  const player = usePlayer(frames, { interval: 1900 });
  const f = player.frame;
  const mitm = mode === 'mitm';

  return (
    <StageFrame
      player={player}
      height={500}
      stats={
        <Stats>
          <Stat label="Round trips" value={f.rtt} color="var(--info)" />
          <Stat label="Secrets sent" value="0" color="var(--ok)" sub="ever, in any mode" />
          <Stat
            label="Status"
            value={f.aborted ? 'aborted' : f.locked ? 'encrypted 🔒' : 'handshaking'}
            color={f.aborted ? 'var(--bad)' : f.locked ? 'var(--ok)' : 'var(--hi)'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: P.pub.color, label: 'public', shape: 'dot' },
            { color: P.cSec.color, label: 'secret (never sent)', shape: 'dot' },
            { color: P.cMix.color, label: 'mixed (safe to send)', shape: 'dot' },
            { color: 'var(--violet)', label: 'encrypted', shape: 'dot' },
            { color: 'var(--ok)', label: 'verified' },
            { color: 'var(--bad)', label: 'failed' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Network"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'normal', label: 'Normal (Eve listens)' },
              { value: 'mitm', label: 'MITM attack (Mallory)' },
            ]}
          />
        </Controls>
      }
    >
      <div className="th">
        <div className="th-scene">
          <PartyPanel name="Client" sub="your browser" paints={f.client} keyPaint={f.clientKey} locked={f.locked} aborted={f.aborted} />
          <div className="th-wire">
            <div className={`th-line ${f.locked ? 'locked' : ''} ${f.aborted ? 'dead' : ''}`} />
            {mitm && (
              <div className="th-mallory">
                <span className="th-mallory-name">Mallory</span>
                <Blobs paints={f.mallory} />
              </div>
            )}
            {!mitm && <div className="th-eve">👁 Eve reads everything on this wire</div>}
            <AnimatePresence>
              {f.wire && <WirePill key={player.index} wire={f.wire} />}
            </AnimatePresence>
            {f.locked && <div className="th-lock">🔒</div>}
          </div>
          <PartyPanel
            name="Server"
            sub="api.example.com"
            paints={f.server}
            keyPaint={f.serverKey}
            locked={f.locked}
            aborted={false}
            dim={mitm}
          />
        </div>

        <div className="th-bottom">
          <div className="th-panel">
            <h4>Certificate check (done by the client)</h4>
            {f.chain ? (
              <div className="th-chain">
                {f.chain.map((l, i) => (
                  <motion.div
                    key={l.name}
                    className={`th-link ${l.state}`}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                  >
                    <span className="th-link-icon">{l.state === 'ok' ? '✓' : l.state === 'bad' ? '✕' : '…'}</span>
                    <span className="th-link-name">{l.name}</span>
                    <span className="th-link-detail">{l.detail}</span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Waiting for the server's certificate. The browser ships with a <b>trust store</b> of root CAs it trusts.
              </p>
            )}
          </div>
          <div className="th-panel">
            <h4>{mitm ? "Mallory's notebook" : "Eve's notebook: everything she saw"}</h4>
            {f.notes.length === 0 && <p className="muted">Nothing yet.</p>}
            <ul className="th-notes">
              <AnimatePresence initial={false}>
                {f.notes.map((n, i) => (
                  <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                    {n.cipher ? <span className="th-sw th-sw-cipher">▒</span> : <span className="th-sw" style={{ background: n.color }} />}
                    <span className={n.cipher ? 'th-cipher' : ''}>{n.text}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

function Blobs({ paints }: { paints: Paint[] }) {
  return (
    <div className="th-blobs">
      <AnimatePresence initial={false}>
        {paints.map((p) => (
          <motion.div
            key={p.label}
            className={`th-blob ${p.secret ? 'secret' : ''}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            title={p.label}
          >
            <span className="th-dot" style={{ background: p.color }}>
              {p.secret ? '🔒' : ''}
            </span>
            <span className="th-blob-label">{p.label}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function PartyPanel({
  name, sub, paints, keyPaint, locked, aborted, dim = false,
}: {
  name: string;
  sub: string;
  paints: Paint[];
  keyPaint: Paint | null;
  locked: boolean;
  aborted: boolean;
  dim?: boolean;
}) {
  let status: ReactNode = <span className="muted">no shared key yet</span>;
  if (aborted) status = <span className="th-bad">connection aborted ✕</span>;
  else if (keyPaint) {
    status = (
      <motion.span className="th-key" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <span className="th-dot th-dot-lg" style={{ background: keyPaint.color }} />
        {keyPaint.label}
        {locked ? ' 🔒' : ''}
      </motion.span>
    );
  }
  return (
    <div className={`th-party ${dim ? 'dim' : ''} ${locked ? 'locked' : ''} ${aborted ? 'aborted' : ''}`}>
      <div className="th-party-name">{name}</div>
      <div className="th-party-sub">{sub}</div>
      <Blobs paints={paints} />
      <div className="th-status">{status}</div>
    </div>
  );
}

function WirePill({ wire }: { wire: Wire }) {
  const pos: Record<Party, string> = { client: '0%', mallory: '50%', server: '100%' };
  return (
    <motion.div
      className={`th-pill ${wire.cipher ? 'cipher' : ''}`}
      style={{ background: wire.color }}
      initial={{ left: pos[wire.from], opacity: 0, scale: 0.7 }}
      animate={{ left: pos[wire.to], opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.1, ease: 'easeInOut', opacity: { duration: 0.2 } }}
    >
      {wire.cipher ? '🔒 ' : ''}
      {wire.label}
    </motion.div>
  );
}

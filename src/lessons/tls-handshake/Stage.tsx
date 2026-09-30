import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Flyer } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { mitmFrames, normalFrames, P, type Paint, type Party, type Wire } from './frames';
import './styles.css';

/** Paint blobs pop in on a bouncy spring. */
const BLOB_SPRING = { type: 'spring', stiffness: 300, damping: 18 } as const;
/** Seconds a message takes to cross the wire. */
const WIRE_TRAVEL = 1.1;

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
            transition={BLOB_SPRING}
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

/** Where each party sits along the wire, in %. */
const WIRE_X: Record<Party, number> = { client: 0, mallory: 50, server: 100 };

function WirePill({ wire }: { wire: Wire }) {
  return (
    <Flyer
      axis="x"
      from={{ x: WIRE_X[wire.from], y: 0 }}
      to={{ x: WIRE_X[wire.to], y: 0 }}
      className={`th-pill ${wire.cipher ? 'cipher' : ''}`}
      style={{ background: wire.color }}
      fade="in"
      startScale={0.7}
      exitScale={null}
      duration={WIRE_TRAVEL}
      opacityDuration={0.2}
    >
      {wire.cipher ? '🔒 ' : ''}
      {wire.label}
    </Flyer>
  );
}

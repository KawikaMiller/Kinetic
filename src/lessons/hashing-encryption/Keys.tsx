import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { useAsyncValue } from '../../core/useAsyncValue';
import { usePlayer } from '../../core/usePlayer';
import { aesRoundTrip } from './crypto';

type Where = 'alice' | 'wire' | 'bob';
/** Horizontal positions across the scene, in percent. The wire runs from Alice to Bob. */
const POS: Record<Where, number> = { alice: 14, wire: 50, bob: 86 };
const X: Record<Where, string> = { alice: `${POS.alice}%`, wire: `${POS.wire}%`, bob: `${POS.bob}%` };
/** Left/right insets that span Alice → Bob, for the wire and the question banner. */
const SPAN = { left: X.alice, right: `${100 - POS.bob}%` };
const MESSAGE = 'Meet at 6pm';
const CARD_SPRING = { type: 'spring', stiffness: 120, damping: 20 } as const;

/* ─── Shared scene pieces ─────────────────────────────────────────── */

function Person({ name, x, children, glow }: { name: string; x: string; children?: ReactNode; glow?: string }) {
  return (
    <div className="he-person" style={{ left: x, ...(glow ? { ['--c' as string]: glow } : {}) }} data-glow={glow ? '1' : undefined}>
      <div className="he-avatar">{name[0]}</div>
      <span className="he-person-name">{name}</span>
      <div className="he-items">{children}</div>
    </div>
  );
}

function Item({ icon, label, color, show = true, shake = false }: { icon: string; label: string; color: string; show?: boolean; shake?: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          className="he-item"
          style={{ borderColor: color, color }}
          initial={{ opacity: 0, scale: 0.4, y: -10 }}
          animate={shake ? { opacity: 1, scale: 1, y: 0, x: [0, -6, 6, -4, 4, 0] } : { opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.45 }}
        >
          <i>{icon}</i> {label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function Wire({ label }: { label: string }) {
  return (
    <div className="he-wire" style={SPAN}>
      <span>{label}</span>
    </div>
  );
}

function Card({ at, locked, text, tone, badge }: { at: Where; locked: boolean; text: string; tone?: 'ok' | 'bad'; badge?: ReactNode }) {
  return (
    <motion.div className={`he-card ${locked ? 'locked' : ''} ${tone ?? ''}`} initial={false} animate={{ left: X[at] }} transition={CARD_SPRING}>
      <span className="he-card-icon">{locked ? '🔒' : '✉'}</span>
      <code>{text}</code>
      {badge}
    </motion.div>
  );
}

/* ─── Symmetric ───────────────────────────────────────────────────── */

interface SymFrame extends Frame {
  keys: boolean;
  at: Where | null;
  locked: boolean;
  eve: boolean;
  opened: boolean;
  question: boolean;
}

function buildSym(): SymFrame[] {
  const f = (p: Partial<SymFrame> & { say: ReactNode }): SymFrame => ({
    keys: false, at: null, locked: false, eve: false, opened: false, question: false, ...p,
  });
  return [
    f({ at: 'alice', say: <>Alice wants to send Bob <span className="hl">{MESSAGE}</span>. The network is public: <b>Eve</b> can copy anything on it.</> }),
    f({ at: 'alice', keys: true, say: <>They both hold <b>the same secret key</b>. That's what <span className="hl">symmetric</span> means: one key locks and unlocks.</> }),
    f({ at: 'alice', keys: true, locked: true, say: <>Alice encrypts with AES-256 and the key. Out comes <b>ciphertext</b>: this is a real encryption, done in your browser just now.</> }),
    f({ at: 'wire', keys: true, locked: true, eve: true, hold: 1.2, say: <>It crosses the wire. Eve copies it, but without the key it's <span className="hl bad">gibberish</span>.</> }),
    f({ at: 'bob', keys: true, locked: true, eve: true, say: <>Bob receives the ciphertext…</> }),
    f({ at: 'bob', keys: true, locked: false, eve: true, opened: true, say: <>…and decrypts it with <b>the same key</b>: <span className="hl ok">{MESSAGE}</span>.</> }),
    f({ at: 'bob', keys: true, opened: true, eve: true, question: true, hold: 2,
      say: <>Symmetric crypto is <span className="hl ok">fast</span> (GB/s, hardware-accelerated): disks, databases, all TLS traffic. The catch: how did they share the key <b>without Eve seeing it</b>?</> }),
  ];
}

export function Symmetric({ modePicker }: { modePicker: ReactNode }) {
  const frames = useMemo(() => buildSym(), []);
  const player = usePlayer(frames, { interval: 1900 });
  const aes = useAsyncValue(() => aesRoundTrip(MESSAGE), MESSAGE);
  const f = player.frame;
  const cipher = aes ? `${aes.cipherHex.slice(0, 22)}…` : 'encrypting…';
  const keyLabel = aes ? `key ${aes.keyHex.slice(0, 8)}…` : 'key';

  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat label="Algorithm" value="AES-256-GCM" color="var(--hi)" />
          <Stat label="Keys" value="1 shared" color="var(--hi)" />
          <Stat label="Eve can read?" value={f.eve ? 'No' : '·'} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the shared secret key' },
            { color: 'var(--bad)', label: 'eavesdropper' },
            { color: 'var(--ok)', label: 'readable again' },
          ]}
        />
      }
      controls={<Controls>{modePicker}</Controls>}
    >
      <div className="he-scene">
        <Wire label="public network" />
        <Person name="Alice" x={X.alice}>
          <Item icon="🔑" label={keyLabel} color="var(--hi)" show={f.keys} />
        </Person>
        <Person name="Eve" x={X.wire} glow="var(--bad)">
          <Item icon="📋" label={f.eve ? cipher : ''} color="var(--bad)" show={f.eve} />
          <Item icon="?" label="no key" color="var(--bad)" show={f.eve} />
        </Person>
        <Person name="Bob" x={X.bob}>
          <Item icon="🔑" label={keyLabel} color="var(--hi)" show={f.keys} />
        </Person>
        {f.question && (
          <motion.div className="he-question" style={SPAN} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span>? how did this key get here safely ?</span>
          </motion.div>
        )}
        {f.at && <Card at={f.at} locked={f.locked} text={f.locked ? cipher : MESSAGE} tone={f.opened ? 'ok' : undefined} />}
      </div>
    </StageFrame>
  );
}

/* ─── Asymmetric ──────────────────────────────────────────────────── */

type Sign = 'none' | 'signed' | 'verified' | 'tampered';

interface AsymFrame extends Frame {
  pair: boolean;
  published: boolean;
  at: Where | null;
  locked: boolean;
  eveTry: boolean;
  opened: boolean;
  sign: Sign;
}

function buildAsym(): AsymFrame[] {
  const f = (p: Partial<AsymFrame> & { say: ReactNode }): AsymFrame => ({
    pair: false, published: false, at: null, locked: false, eveTry: false, opened: false, sign: 'none', ...p,
  });
  const base = { pair: true, published: true };
  return [
    f({ pair: true, say: <>Bob generates a <b>key pair</b>: a <span className="hl info">public key</span> (think: an open padlock) and a <span className="hl violet">private key</span> that never leaves him.</> }),
    f({ ...base, say: <>He hands copies of the padlock to <b>everyone</b>, Eve included. That's fine: a padlock can only <b>lock</b>.</> }),
    f({ ...base, at: 'alice', locked: true, say: <>Alice locks her message with <b>Bob's public key</b>. No shared secret needed, ever.</> }),
    f({ ...base, at: 'wire', locked: true, eveTry: true, hold: 1.3, say: <>Eve grabs it and tries her copy of the public key. <span className="hl bad">It can't unlock.</span> Only the private key can.</> }),
    f({ ...base, at: 'bob', locked: false, opened: true, say: <>Bob opens it with his <span className="hl violet">private key</span>: <span className="hl ok">{MESSAGE}</span>.</> }),
    f({ ...base, at: 'bob', sign: 'signed', say: <>Now flip it around: <b>signatures</b>. Bob signs <span className="hl">Release v2.1</span> with his <span className="hl violet">private key</span>.</> }),
    f({ ...base, at: 'alice', sign: 'verified', hold: 1.2, say: <>Anyone checks the signature with Bob's <span className="hl info">public key</span>. <span className="hl ok">✓ Valid</span>: it really came from Bob, unchanged.</> }),
    f({ ...base, at: 'alice', sign: 'tampered', hold: 1.3, say: <>Eve swaps in a malware link on the way. The signature no longer matches the message: <span className="hl bad">✗ rejected</span>.</> }),
    f({ ...base, at: 'alice', sign: 'tampered', hold: 2,
      say: <>Asymmetric crypto is <b>orders of magnitude slower</b>, so real systems (like TLS) use it only to agree on a <span className="hl">symmetric key</span>, then switch to fast AES.</> }),
  ];
}

export function Asymmetric({ modePicker }: { modePicker: ReactNode }) {
  const frames = useMemo(() => buildAsym(), []);
  const player = usePlayer(frames, { interval: 2000 });
  const f = player.frame;
  const signing = f.sign !== 'none';
  const text = signing
    ? f.sign === 'tampered' ? 'Release v2.1 + evil.exe' : 'Release v2.1'
    : f.locked ? '8f1c…e4a9 (RSA/ECC)' : MESSAGE;
  const badge = signing ? (
    <span className={`he-sig ${f.sign}`}>
      ✍ sig {f.sign === 'verified' ? '✓' : f.sign === 'tampered' ? '✗' : ''}
    </span>
  ) : null;

  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat label="Keys" value="public + private" color="var(--info)" />
          <Stat label="Mode" value={signing ? 'signature' : 'encryption'} color="var(--violet)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'public key: locks / verifies' },
            { color: 'var(--violet)', label: 'private key: unlocks / signs' },
            { color: 'var(--ok)', label: 'readable / valid' },
            { color: 'var(--bad)', label: 'rejected' },
          ]}
        />
      }
      controls={<Controls>{modePicker}</Controls>}
    >
      <div className="he-scene">
        <Wire label="public network" />
        <Person name="Alice" x={X.alice}>
          <Item icon="🔓" label="Bob's public" color="var(--info)" show={f.published} />
        </Person>
        <Person name="Eve" x={X.wire} glow="var(--bad)">
          <Item icon="🔓" label="Bob's public" color="var(--info)" show={f.published} shake={f.eveTry} />
          <Item icon="✗" label="can't unlock" color="var(--bad)" show={f.eveTry} />
        </Person>
        <Person name="Bob" x={X.bob}>
          <Item icon="🔓" label="public" color="var(--info)" show={f.pair} />
          <Item icon="🗝" label="private" color="var(--violet)" show={f.pair} />
        </Person>
        {f.at && (
          <Card
            at={f.at}
            locked={f.locked && !signing}
            text={text}
            tone={f.sign === 'tampered' ? 'bad' : f.opened || f.sign === 'verified' ? 'ok' : undefined}
            badge={badge}
          />
        )}
      </div>
    </StageFrame>
  );
}

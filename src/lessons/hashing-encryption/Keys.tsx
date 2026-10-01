import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Stat, Stats } from '../../components/ui';
import { useAsyncValue } from '../../core/useAsyncValue';
import { usePlayer } from '../../core/usePlayer';
import { aesRoundTrip, asymDemo } from './crypto';
import { buildAsym, buildSym } from './keyFrames';
import { cardPlacement, KEY_SCENE_MIN_WIDTH, MESSAGE, RELEASE, SPAN, TAMPERED, X, type Where } from './keyModel';

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
    <motion.div className={`he-card ${locked ? 'locked' : ''} ${tone ?? ''}`} initial={false} animate={cardPlacement(at)} transition={CARD_SPRING}>
      <span className="he-card-icon">{locked ? '🔒' : '✉'}</span>
      <code>{text}</code>
      {badge}
    </motion.div>
  );
}

/* ─── Symmetric ───────────────────────────────────────────────────── */

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
      minWidth={KEY_SCENE_MIN_WIDTH}
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

export function Asymmetric({ modePicker }: { modePicker: ReactNode }) {
  const frames = useMemo(() => buildAsym(), []);
  const player = usePlayer(frames, { interval: 2000 });
  // Real RSA-OAEP encryption and ECDSA signing, with fresh key pairs, once per visit.
  const demo = useAsyncValue(() => asymDemo(MESSAGE, RELEASE, TAMPERED), 'asym');
  const f = player.frame;
  const signing = f.sign !== 'none';
  const text = signing
    ? f.sign === 'tampered' ? TAMPERED : RELEASE
    : f.locked ? (demo ? `${demo.cipherHex.slice(0, 14)}… (RSA-OAEP)` : 'encrypting…') : MESSAGE;
  // The ✓ / ✗ is the real verification result for the text on the card.
  const checked = f.sign === 'verified' ? demo?.valid : f.sign === 'tampered' ? demo?.tamperedValid : undefined;
  const mark = f.sign === 'verified' || f.sign === 'tampered' ? (checked === undefined ? '…' : checked ? '✓' : '✗') : '';
  const badge = signing ? <span className={`he-sig ${f.sign}`}>✍ sig {mark}</span> : null;

  return (
    <StageFrame
      player={player}
      height={400}
      minWidth={KEY_SCENE_MIN_WIDTH}
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

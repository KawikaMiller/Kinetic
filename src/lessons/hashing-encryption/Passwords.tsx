import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { useAsyncValue } from '../../core/useAsyncValue';
import { usePlayer } from '../../core/usePlayer';
import { sha256Many } from './crypto';

type Storage = 'plain' | 'hash' | 'salt';
type User = 'alice' | 'bob';

interface PwFrame extends Frame {
  storage: Storage;
  breach: boolean;
  cracked: User[];
  lookup: 'hit' | 'miss' | null;
  race: 'none' | 'fast' | 'slow';
}

const SALTS: Record<User, string> = { alice: 'c81e7a', bob: '4f0d92' };
const RAINBOW = ['123456', 'password', 'hunter2', 'qwerty'];
// Everything the table and the attacker's rainbow table need, hashed for real.
const INPUTS = [...RAINBOW, SALTS.alice + 'hunter2', SALTS.bob + 'hunter2'];

// 26^8 lowercase 8-letter passwords, at ~10 billion SHA-256/s (one modern GPU)
// vs ~10 thousand bcrypt/s at a sensible cost factor.
const SPACE = 26 ** 8;
const FAST_S = SPACE / 1e10;
const SLOW_DAYS = SPACE / 1e4 / 86400;

function buildFrames(): PwFrame[] {
  const f = (p: Partial<PwFrame> & { say: ReactNode }): PwFrame => ({
    storage: 'plain', breach: false, cracked: [], lookup: null, race: 'none', ...p,
  });
  return [
    f({ say: <>Alice and Bob sign up. By coincidence both pick the password <span className="hl">hunter2</span>.</> }),
    f({ say: <>Version 1 stores the password <b>as typed</b>. Works fine, until…</> }),
    f({ breach: true, cracked: ['alice', 'bob'], hold: 1.3,
      say: <><span className="hl bad">The database leaks.</span> The attacker just reads every password. Game over, instantly.</> }),
    f({ storage: 'hash',
      say: <>Version 2 stores <span className="hl info">SHA-256(password)</span>. At login, hash what they typed and compare. No plaintext anywhere.</> }),
    f({ storage: 'hash', breach: true, lookup: 'hit', cracked: ['alice', 'bob'], hold: 1.4,
      say: <>Leak again. Two rows share <b>the same hash</b>, so the attacker looks it up in a precomputed <span className="hl bad">rainbow table</span>: hunter2. Both cracked.</> }),
    f({ storage: 'salt',
      say: <>Version 3 adds a random <span className="hl violet">salt</span> per user and stores SHA-256(salt + password). Same password, <b>different hashes</b>.</> }),
    f({ storage: 'salt', breach: true, lookup: 'miss', hold: 1.3,
      say: <>Leak again. The rainbow table is useless: it was built without these salts. Now each password must be guessed <b>one user at a time</b>.</> }),
    f({ storage: 'salt', breach: true, lookup: 'miss', race: 'fast', hold: 1.5,
      say: <>But SHA-256 is built to be <span className="hl bad">fast</span>. A GPU tries ~10 billion guesses a second: every 8-letter lowercase password in ~{Math.round(FAST_S)} s.</> }),
    f({ storage: 'salt', breach: true, lookup: 'miss', race: 'slow', hold: 1.5,
      say: <>So passwords use deliberately <span className="hl ok">slow</span> hashes: <b>bcrypt, scrypt or Argon2</b>, with a tunable cost. The same search now takes ~{Math.round(SLOW_DAYS)} days, per user.</> }),
    f({ storage: 'salt', breach: false, lookup: null, race: 'slow', hold: 2,
      say: <>Recipe: <span className="hl violet">unique salt</span> + <span className="hl ok">slow hash</span> (Argon2id or bcrypt). Never plaintext, never plain fast hashes, never encryption you can reverse.</> }),
  ];
}

export function Passwords({ modePicker }: { modePicker: ReactNode }) {
  const frames = useMemo(() => buildFrames(), []);
  const player = usePlayer(frames, { interval: 2100 });
  const hashes = useAsyncValue(() => sha256Many(INPUTS), INPUTS.join('\u0000'));
  const f = player.frame;

  const hashOf = (input: string) => {
    const i = INPUTS.indexOf(input);
    return hashes ? hashes[i] : '';
  };
  const stored = (u: User) => {
    if (f.storage === 'plain') return 'hunter2';
    if (f.storage === 'hash') return hashOf('hunter2');
    return `${SALTS[u]}$${hashOf(SALTS[u] + 'hunter2')}`;
  };

  return (
    <StageFrame
      player={player}
      height={430}
      stats={
        <Stats>
          <Stat label="Stored as" value={{ plain: 'plaintext', hash: 'SHA-256', salt: 'salt + hash' }[f.storage]} color="var(--info)" />
          <Stat label="Cracked" value={`${f.cracked.length}/2`} color={f.cracked.length ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'hash' },
            { color: 'var(--violet)', label: 'salt' },
            { color: 'var(--bad)', label: 'cracked / leaked' },
            { color: 'var(--ok)', label: 'safe' },
          ]}
        />
      }
      controls={<Controls>{modePicker}</Controls>}
    >
      <div className="he-pw">
        <div className={`he-db ${f.breach ? 'breach' : ''}`}>
          <div className="he-db-head">
            <span>users table</span>
            <AnimatePresence>
              {f.breach && (
                <motion.span className="he-leak" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  ⚠ LEAKED
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="he-db-cols">
            <span>user</span>
            <span>stored password</span>
          </div>
          {(['alice', 'bob'] as User[]).map((u) => (
            <div key={u} className={`he-db-row ${f.cracked.includes(u) ? 'cracked' : ''}`}>
              <span className="he-user">{u}</span>
              <motion.code key={f.storage} className={`he-stored ${f.storage}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
                {f.storage === 'salt' ? (
                  <>
                    <span className="he-salt">{SALTS[u]}</span>${hashOf(SALTS[u] + 'hunter2').slice(0, 30)}…
                  </>
                ) : f.storage === 'hash' ? (
                  `${stored(u).slice(0, 36)}…`
                ) : (
                  stored(u)
                )}
              </motion.code>
              {f.cracked.includes(u) && <span className="he-cracked">cracked: hunter2</span>}
            </div>
          ))}
          {f.storage === 'hash' && (
            <p className="he-note">
              Both rows are <b>identical</b>, so one guess cracks both.
            </p>
          )}
          {f.storage === 'salt' && (
            <p className="he-note">
              Same password, different salts, <b>completely different</b> hashes.
            </p>
          )}
        </div>

        <div className={`he-attacker ${f.breach ? 'on' : ''}`}>
          <div className="he-attacker-head">🕵 attacker</div>
          <div className="he-rainbow">
            <span className="he-rainbow-title">rainbow table (precomputed)</span>
            {RAINBOW.map((pw) => {
              const hit = f.lookup === 'hit' && pw === 'hunter2';
              return (
                <div key={pw} className={`he-rainbow-row ${hit ? 'hit' : ''} ${f.lookup === 'miss' ? 'miss' : ''}`}>
                  <code>{hashOf(pw).slice(0, 14)}…</code>
                  <span>→ {pw}</span>
                </div>
              );
            })}
            {f.lookup === 'miss' && <span className="he-miss">no match for salted hashes</span>}
          </div>

          {f.race !== 'none' && (
            <div className="he-race">
              <span className="he-race-title">time to try every 8-letter lowercase password</span>
              <RaceBar label="SHA-256 (fast)" color="var(--bad)" done={1} note={`~${Math.round(FAST_S)} seconds`} />
              {f.race === 'slow' && (
                <RaceBar label="bcrypt / Argon2 (slow)" color="var(--ok)" done={0.004} note={`~${Math.round(SLOW_DAYS)} days`} />
              )}
            </div>
          )}
        </div>
      </div>
    </StageFrame>
  );
}

function RaceBar({ label, color, done, note }: { label: string; color: string; done: number; note: string }) {
  return (
    <div className="he-racebar">
      <span>{label}</span>
      <div className="he-racebar-track">
        <motion.i
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(done * 100, 1)}%` }}
          transition={{ duration: done === 1 ? 1.4 : 2.5, ease: 'linear' }}
        />
      </div>
      <b style={{ color }}>{note}</b>
    </div>
  );
}

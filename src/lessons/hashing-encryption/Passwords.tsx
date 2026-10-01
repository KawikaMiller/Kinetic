import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Stat, Stats } from '../../components/ui';
import { useAsyncValue } from '../../core/useAsyncValue';
import { usePlayer } from '../../core/usePlayer';
import { sha256Many } from './crypto';
import { buildPasswordFrames } from './passwordFrames';
import { FAST_S, hashInput, INPUTS, LOOKUP, PASSWORD, SALTS, SLOW_BAR_DRAWN, SLOW_DAYS, SLOWDOWN, USERS, type User } from './passwordModel';

export function Passwords({ modePicker }: { modePicker: ReactNode }) {
  const frames = useMemo(() => buildPasswordFrames(), []);
  const player = usePlayer(frames, { interval: 2100 });
  const hashes = useAsyncValue(() => sha256Many(INPUTS), INPUTS.join('\u0000'));
  const f = player.frame;

  const hashOf = (input: string) => {
    const i = INPUTS.indexOf(input);
    return hashes ? hashes[i] : '';
  };
  const stored = (u: User) => {
    const input = hashInput(f.storage, u);
    if (input === null) return PASSWORD;
    return f.storage === 'salt' ? `${SALTS[u]}$${hashOf(input)}` : hashOf(input);
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
          {USERS.map((u) => (
            <div key={u} className={`he-db-row ${f.cracked.includes(u) ? 'cracked' : ''}`}>
              <span className="he-user">{u}</span>
              <motion.code key={f.storage} className={`he-stored ${f.storage}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
                {f.storage === 'salt' ? (
                  <>
                    <span className="he-salt">{SALTS[u]}</span>${hashOf(SALTS[u] + PASSWORD).slice(0, 30)}…
                  </>
                ) : f.storage === 'hash' ? (
                  `${stored(u).slice(0, 36)}…`
                ) : (
                  stored(u)
                )}
              </motion.code>
              {f.cracked.includes(u) && <span className="he-cracked">cracked: {PASSWORD}</span>}
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
          <div className="he-lookup">
            <span className="he-lookup-title">lookup table (precomputed hash → password)</span>
            {LOOKUP.map((pw) => {
              const hit = f.lookup === 'hit' && pw === PASSWORD;
              return (
                <div key={pw} className={`he-lookup-row ${hit ? 'hit' : ''} ${f.lookup === 'miss' ? 'miss' : ''}`}>
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
              {f.race === 'slow' && (
                <span className="he-race-scale">Bars not to scale: the real gap is about {SLOWDOWN.toLocaleString('en-US')}×.</span>
              )}
              <RaceBar label="SHA-256 (fast)" color="var(--bad)" done={1} note={`~${Math.round(FAST_S)} seconds`} />
              {f.race === 'slow' && (
                <RaceBar label="bcrypt / Argon2 (slow)" color="var(--ok)" done={SLOW_BAR_DRAWN} note={`~${Math.round(SLOW_DAYS)} days`} />
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

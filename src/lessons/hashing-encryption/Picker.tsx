import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';

type Tool = 'hash' | 'slow' | 'sym' | 'asym' | 'sign';

const TOOLS: Record<Tool, { label: string; color: string }> = {
  hash: { label: 'Hash (SHA-256)', color: 'var(--info)' },
  slow: { label: 'Salted slow hash', color: 'var(--ok)' },
  sym: { label: 'Symmetric encryption', color: 'var(--hi)' },
  asym: { label: 'Asymmetric encryption', color: 'var(--violet)' },
  sign: { label: 'Digital signature', color: 'var(--orange)' },
};

const SCENARIOS: { q: string; a: Tool; why: string }[] = [
  { q: 'Store user passwords', a: 'slow', why: 'You never need the password back, only to check a guess. Argon2id or bcrypt, unique salt each.' },
  { q: 'Check a 4 GB download isn’t corrupted', a: 'hash', why: 'Hash the file and compare with the published digest. Fast, fixed-size, one bit changes everything.' },
  { q: 'Encrypt a database backup you’ll restore later', a: 'sym', why: 'You need the data back, it’s big, and you hold the key. AES is built for exactly this.' },
  { q: 'Send a secret to someone you’ve never met', a: 'asym', why: 'Lock it with their public key (in practice, to agree on a symmetric key, as TLS does).' },
  { q: 'Prove a software release really came from you', a: 'sign', why: 'Sign with your private key; anyone verifies with your public key. Tampering breaks it.' },
  { q: 'Store credit card numbers you must charge again', a: 'sym', why: 'Hashing is one-way, so you could never charge the card. Encrypt it, and guard the key (ideally in a KMS).' },
];

export function Picker({ modePicker }: { modePicker: ReactNode }) {
  const [answers, setAnswers] = useState<(Tool | null)[]>(() => SCENARIOS.map(() => null));
  const setCaption = useSetCaption();
  const right = answers.filter((a, i) => a === SCENARIOS[i].a).length;

  useIntroCaption(<>Six real jobs. For each one, pick the right tool. Wrong picks tell you what to ask yourself.</>);

  const pick = (i: number, t: Tool) => {
    const next = answers.slice();
    next[i] = t;
    setAnswers(next);
    const s = SCENARIOS[i];
    setCaption(
      t === s.a ? (
        <>
          <span className="hl ok">✓ {TOOLS[t].label}</span> {s.why}
        </>
      ) : (
        <>
          <span className="hl bad">✗ Not {TOOLS[t].label.toLowerCase()}.</span> Ask: do you need the data <b>back</b>? Who holds the key?
        </>
      ),
    );
  };

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="Correct" value={`${right}/${SCENARIOS.length}`} color={right === SCENARIOS.length ? 'var(--ok)' : 'var(--hi)'} />
        </Stats>
      }
      controls={
        <Controls>
          {modePicker}
          <Button
            onClick={() => {
              setAnswers(SCENARIOS.map(() => null));
              setCaption(<>Fresh board. For each job, pick the right tool.</>);
            }}
          >
            Reset
          </Button>
        </Controls>
      }
    >
      <div className="he-picker">
        <p className="he-picker-rule">
          <b>Need the original back?</b> → encryption. <b>Only need to check it?</b> → hashing. <b>Need to prove who sent it?</b> → signature.
        </p>
        <div className="he-picker-grid">
          {SCENARIOS.map((s, i) => {
            const a = answers[i];
            const ok = a === s.a;
            return (
              <div key={i} className={`he-scn ${a ? (ok ? 'ok' : 'bad') : ''}`}>
                <p>{s.q}</p>
                <div className="he-scn-opts">
                  {(Object.keys(TOOLS) as Tool[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={a === t ? 'on' : ''}
                      style={{ ['--c' as string]: TOOLS[t].color }}
                      onClick={() => pick(i, t)}
                      disabled={ok && a !== t}
                    >
                      {TOOLS[t].label}
                    </button>
                  ))}
                </div>
                <AnimatePresence>
                  {ok && (
                    <motion.span className="he-scn-done" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
                      ✓
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </StageFrame>
  );
}

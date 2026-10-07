import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useAsyncValue } from '../../core/useAsyncValue';
import { TAMPER_STORY } from './frames';
import { ALG, clampSub, forge, LESSON_NOW, PAYLOAD, tamperStory, type Resign } from './jwt';
import { TokenString } from './JwtParts';

/** The verdict badge pops in a little bouncier than the SPRING presets. */
const VERDICT_SPRING = { type: 'spring', stiffness: 300, damping: 18 } as const;


export function Tamper({ modePicker }: { modePicker: ReactNode }) {
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [sub, setSub] = useState('42');
  const [resign, setResign] = useState<Resign>('keep');
  const setCaption = useSetCaption();

  const payload = { ...PAYLOAD, sub, role };
  const edited = role !== PAYLOAD.role || sub !== PAYLOAD.sub;
  const key = JSON.stringify(payload) + resign;

  // Keep showing the last verdict while the next one is computed, so typing doesn't flicker.
  const result = useAsyncValue(() => forge(sub, role, resign), key, { keepPrevious: true });

  useEffect(() => {
    if (!result) return;
    setCaption(TAMPER_STORY[tamperStory(result, resign)], { quiet: true });
  }, [result, resign, setCaption]);

  const sig = result?.jwt.signature ?? '';
  const expected = result?.expected ?? '';

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Payload" value={edited ? 'edited' : 'original'} color={edited ? 'var(--hi)' : 'var(--muted)'} />
          <Stat label="Server says" value={result ? (result.valid ? 'valid' : 'invalid') : '·'} color={result?.valid ? (resign === 'leaked' && edited ? 'var(--bad)' : 'var(--ok)') : 'var(--bad)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'header' },
            { color: 'var(--info)', label: 'payload (claims)' },
            { color: 'var(--amber)', label: 'signature' },
          ]}
        />
      }
      controls={
        <Controls>
          {modePicker}
          <Segmented
            label="Attacker signs it with…"
            value={resign}
            onChange={setResign}
            options={[
              { value: 'keep', label: 'the old signature' },
              { value: 'guess', label: 'a guessed key' },
              { value: 'leaked', label: 'the leaked real key' },
            ]}
          />
          <Button
            onClick={() => {
              setRole('user');
              setSub('42');
              setResign('keep');
            }}
          >
            Reset token
          </Button>
          <Hint block>
            Real HMAC-SHA256 (Web Crypto) with a made-up demo key, all inside this page. The server accepts only {ALG}, compares
            signatures in constant time and checks exp against the lesson's fixed clock ({new Date(LESSON_NOW * 1000).toISOString().slice(11, 16)} UTC
            on the day the token was issued). Real servers also check the issuer and audience.
          </Hint>
        </Controls>
      }
    >
      <div className="aj-tamper">
        <Box className="aj-edit">
          <span className="aj-panel-title">Payload, decoded and editable</span>
          <div className="aj-claim">
            <code>"sub":</code>
            <input value={sub} onChange={(e) => setSub(clampSub(e.target.value))} aria-label="Subject (user id)" />
          </div>
          <div className="aj-claim">
            <code>"role":</code>
            <div className="aj-role">
              {(['user', 'admin'] as const).map((r) => (
                <button key={r} type="button" className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
                  "{r}"
                </button>
              ))}
            </div>
          </div>
          <div className="aj-claim dim">
            <code>"exp":</code>
            <code>{PAYLOAD.exp}</code>
          </div>
        </Box>

        <Box className="aj-wire">
          <span className="aj-panel-title">Token sent to the server</span>
          <TokenString jwt={result?.jwt ?? null} />
        </Box>

        <Box className={`aj-check ${result ? (result.valid ? (edited ? 'forged' : 'ok') : 'bad') : ''}`}>
          <span className="aj-panel-title">Server: recompute HMAC-SHA256(header.payload, its secret)</span>
          <div className="aj-sigs">
            <span>token says</span>
            <code>{[...sig.slice(0, 43)].map((c, i) => <span key={i} className={expected[i] !== c ? 'x' : ''}>{c}</span>)}</code>
            <span>server computes</span>
            <code>{expected.slice(0, 43)}</code>
          </div>
          <motion.span key={`${key}-${result?.valid}`} className="aj-big" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={VERDICT_SPRING}>
            {!result ? '…' : result.valid ? (edited ? '⚠ ACCEPTED (forged!)' : '✓ VALID') : '✗ 401 INVALID SIGNATURE'}
          </motion.span>
        </Box>
      </div>
    </StageFrame>
  );
}

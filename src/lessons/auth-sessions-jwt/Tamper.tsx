import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { b64urlJson, hmac, PAYLOAD, SERVER_SECRET, signJwt, verifyJwt, type Jwt } from './jwt';
import { TokenString } from './JwtParts';

type Resign = 'keep' | 'guess' | 'leaked';

interface Result {
  jwt: Jwt;
  valid: boolean;
  expected: string | null;
  edited: boolean;
}

/** The secret the attacker re-signs with in the 'guess' option. */
const GUESSED_SECRET = 'password123';
/** The verdict badge pops in a little bouncier than the SPRING presets. */
const VERDICT_SPRING = { type: 'spring', stiffness: 300, damping: 18 } as const;

/** Build the attacker's token from the edited claims and ask the server whether it's valid. */
async function forge(sub: string, role: string, resign: Resign): Promise<Result | null> {
  const original = await signJwt(PAYLOAD, SERVER_SECRET);
  if (!original) return null;
  const body = b64urlJson({ ...PAYLOAD, sub, role });
  const signature =
    resign === 'keep' ? original.signature : (await hmac(resign === 'guess' ? GUESSED_SECRET : SERVER_SECRET, `${original.header}.${body}`)) ?? '';
  const jwt = { header: original.header, payload: body, signature };
  const { valid, expected } = await verifyJwt(jwt);
  return { jwt, valid, expected, edited: role !== PAYLOAD.role || sub !== PAYLOAD.sub };
}

export function Tamper({ modePicker }: { modePicker: ReactNode }) {
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [sub, setSub] = useState('42');
  const [resign, setResign] = useState<Resign>('keep');
  const [result, setResult] = useState<Result | null>(null);
  const setCaption = useSetCaption();

  const payload = { ...PAYLOAD, sub, role };
  const edited = role !== PAYLOAD.role || sub !== PAYLOAD.sub;
  const key = JSON.stringify(payload) + resign;

  // Keep showing the last verdict while the next one is computed, so typing doesn't flicker.
  useEffect(() => {
    let alive = true;
    forge(sub, role, resign).then((r) => {
      if (alive && r) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [sub, role, resign]);

  useEffect(() => {
    if (!result) return;
    if (!result.edited && resign === 'keep') {
      setCaption(<>This is the genuine token the server issued. Edit the payload like an attacker would: make yourself <span className="hl">admin</span>.</>, { quiet: true });
    } else if (result.valid && resign === 'leaked') {
      setCaption(<><span className="hl bad">Accepted.</span> With the real secret, a forged token is indistinguishable from a real one. Guard signing keys like passwords, and rotate them.</>, { quiet: true });
    } else if (result.valid) {
      setCaption(<><span className="hl ok">Valid</span>: untouched token, correct signature.</>, { quiet: true });
    } else if (resign === 'guess') {
      setCaption(<><span className="hl bad">Rejected.</span> Re-signing with a guessed key gives a different signature. Only the server's secret produces the right one.</>, { quiet: true });
    } else {
      setCaption(<><span className="hl bad">Rejected.</span> You changed the payload but can't produce a new signature, so the server's recomputed signature doesn't match.</>, { quiet: true });
    }
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
            { color: 'var(--hi)', label: 'signature' },
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
        </Controls>
      }
    >
      <div className="aj-tamper">
        <Box className="aj-edit">
          <span className="aj-panel-title">Payload, decoded and editable</span>
          <div className="aj-claim">
            <code>"sub":</code>
            <input value={sub} onChange={(e) => setSub(e.target.value.slice(0, 6))} aria-label="Subject (user id)" />
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

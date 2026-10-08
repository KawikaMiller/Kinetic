import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useAsyncValue } from '../../core/useAsyncValue';
import { usePlayer } from '../../core/usePlayer';
import { ACTORS, LOOKALIKE_HOST, REAL_HOST, frames, ladder, whoGetsIn, type Method, type Site } from './phish';
import { makeProof } from './passkey';

const STEP_MS = 1600;
const METHODS: { value: Method; label: string }[] = [
  { value: 'totp', label: 'Password + 6-digit code' },
  { value: 'passkey', label: 'Passkey' },
];
const SITES: { value: Site; label: string }[] = [
  { value: 'real', label: REAL_HOST },
  { value: 'lookalike', label: `${LOOKALIKE_HOST} (look-alike)` },
];
const WHO_TEXT = { you: 'you', attacker: 'the attacker', nobody: 'nobody' } as const;

export function PhishScene({ picker }: { picker: ReactNode }) {
  const [method, setMethod] = useState<Method>('totp');
  const [site, setSite] = useState<Site>('lookalike');
  const proof = useAsyncValue(() => makeProof(), 'once');
  const messages = useMemo(() => ladder(method, site, proof), [method, site, proof]);
  const fs = useMemo(() => frames(method, site, proof), [method, site, proof]);
  const player = usePlayer(fs, { interval: STEP_MS });
  const who = whoGetsIn(method, site);
  const done = player.frame.step >= messages.length - 1;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat
            label="Signed in as you"
            value={done ? WHO_TEXT[who] : '…'}
            color={!done ? undefined : who === 'attacker' ? 'var(--bad)' : 'var(--ok)'}
            sub={done ? (who === 'attacker' ? 'the look-alike passed everything on' : who === 'nobody' ? 'nothing usable to pass on' : 'the real site, the real you') : 'play to find out'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'your own steps' },
            { color: 'var(--orange)', label: 'the look-alike site' },
            { color: 'var(--violet)', label: 'the passkey signature' },
            { color: 'var(--ok)', label: 'origin matches, or nothing to give' },
            { color: 'var(--bad)', label: 'a stranger signed in' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Sign in with" value={method} onChange={(m: Method) => setMethod(m)} options={METHODS} />
          <Segmented label="You are on" value={site} onChange={(s: Site) => setSite(s)} options={SITES} />
        </>,
      ]}
    >
      <div className="stage-pad mfa">
        <SequenceDiagram actors={ACTORS} messages={messages} step={player.frame.step} ariaLabel="Signing in on the real site or a look-alike" />
        {method === 'passkey' && (
          <Box>
            <SectionTitle hint="real ECDSA P-256, computed in your browser">Why the origin binds the signature</SectionTitle>
            {proof ? (
              <table className="data-table">
                <tbody>
                  <tr><th scope="row">Signature made for {REAL_HOST}</th><td className="mfa-sig">{proof.signatureHex.slice(0, 24)}…</td></tr>
                  <tr><th scope="row">Verifies as a sign-in to {REAL_HOST}</th><td className={proof.verifiesForReal ? 'mfa-yes' : 'mfa-no'}>{proof.verifiesForReal ? 'yes' : 'no'}</td></tr>
                  <tr><th scope="row">Same signature checked as a sign-in to {LOOKALIKE_HOST}</th><td className={proof.verifiesForLookalike ? 'mfa-yes' : 'mfa-no'}>{proof.verifiesForLookalike ? 'yes' : 'no'}</td></tr>
                  <tr><th scope="row">What the authenticator offers at {LOOKALIKE_HOST}</th><td className={proof.lookalikeAssertion ? 'mfa-no' : 'mfa-yes'}>{proof.lookalikeAssertion ? 'a signature' : 'nothing'}</td></tr>
                </tbody>
              </table>
            ) : (
              <p className="mfa-note">Computing a real signature…</p>
            )}
          </Box>
        )}
        <Hint block>
          Real HMAC-SHA-1 and ECDSA in your browser; the sites, phone and authenticator are simulated. Passkeys are simplified: real WebAuthn adds attestation, counters and user verification. The look-alike is an abstract actor: no relay steps are shown.
        </Hint>
      </div>
    </StageFrame>
  );
}

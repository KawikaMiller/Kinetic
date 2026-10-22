import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { crossCheckP256 } from '../../core/ecc';
import { hasSubtle } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { KNOWN_MULTIPLES, p256XPrefix } from './model';

const NEEDS_SECURE = 'needs https or localhost: this page has no crypto.subtle here, so the browser check is unavailable. The other scenes still work.';

/** Scene 4: the page's own d x G against a fresh P-256 key from the browser, and two known answers that need no browser support. */
export function BrowserScene({ picker }: { picker: ReactNode }) {
  const [round, setRound] = useState(0);
  const secure = hasSubtle();
  const result = useAsyncValue(() => (round === 0 ? Promise.resolve(null) : crossCheckP256()), round);
  const running = round > 0 && result === null && secure;

  return (
    <StageFrame
      height={380}
      intro={secure ? 'Press the button: the browser makes a fresh P-256 key pair, and this page computes d x G itself and compares.' : NEEDS_SECURE}
      introKey={`browser|${secure}`}
      stats={
        <Stats>
          <Stat label="Agreement" value={result ? (result.equal ? 'equal' : 'differs') : '–'} color={result ? (result.equal ? 'var(--ok)' : 'var(--bad)') : undefined} sub={result?.equal === false ? 'a bug report, never expected' : 'this page vs the browser'} />
          <Stat label="Scalar size" value={result ? `${result.bits} bits` : '–'} sub="only the bit length is shown" />
          <Stat label="Steps" value={result ? `${result.doublings} + ${result.additions}` : '–'} sub="doublings + additions" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'the two agree', shape: 'square' }, { color: 'var(--bad)', label: 'they differ', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => setRound(round + 1)} softDisabled={!secure || running}>Check our arithmetic against the browser</Button>
        </>,
      ]}
    >
      <div className="stage-pad ec-stage">
        {!secure && <p className="ec-refusal" role="note">{NEEDS_SECURE}</p>}
        {result && (
          <p className="ec-note">
            Public x begins <code>{result.publicXPrefix}</code>. The key exists only on this page, is dropped on reload and was never used for anything; only its bit length, the two step counts and the first 8 hex digits of the public x are shown.
          </p>
        )}
        <div className="ec-known">
          <b>Known answers on P-256, computed by this page without the browser:</b>
          <ul>
            {KNOWN_MULTIPLES.map((m) => (
              <li key={String(m)}>
                {String(m)}G has x beginning <code>{p256XPrefix(m)}</code>
              </li>
            ))}
          </ul>
          <p className="ec-note">The tests compare these to Node&apos;s own ECDH. Agreeing on one fresh key shows this arithmetic matches a real implementation on that key; it does not make the code suitable for real keys.</p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the key pair and the public point come from the browser&apos;s Web Crypto on P-256</Provenance>
        <Provenance kind="from-memory">P-256 is the curve NIST published as secp256r1 / prime256v1 (verify against FIPS 186 and SEC 2); its parameters are typed and tested for consistency, not copied from a source</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

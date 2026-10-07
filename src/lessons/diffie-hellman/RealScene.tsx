import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { hasSubtle, toHex } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { ecdhAgree, type EcdhSide } from './ecdh';
import { realCaption } from './frames';

const sameBytes = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((v, i) => v === y[i]);

function Side({ name, side }: { name: string; side: EcdhSide }) {
  return (
    <Box className="dh-real-side">
      <SectionTitle>{name}</SectionTitle>
      <p className="dh-real-label">Public key, sent on the wire ({side.publicRaw.length} bytes)</p>
      <code className="dh-hex tone-info">{toHex(side.publicRaw)}</code>
      <p className="dh-real-label">Private key</p>
      <p className="dh-private">🔒 {side.privateExtractable ? 'extractable' : 'non-extractable: the browser won\'t export it, even to this page'}</p>
      <p className="dh-real-label">Shared secret it derives ({side.secret.length * 8} bits)</p>
      <code className="dh-hex tone-ok">{toHex(side.secret)}</code>
    </Box>
  );
}

export function RealScene({ picker }: { picker: ReactNode }) {
  const [round, setRound] = useState(0);
  const result = useAsyncValue(() => ecdhAgree(), round);
  const equal = result ? sameBytes(result.alice.secret, result.bob.secret) : null;

  useIntroCaption(realCaption(result === null ? 'pending' : equal ? 'equal' : 'different'), [round, result]);

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Curve" value="P-256" sub="real WebCrypto" />
          <Stat label="Secrets" value={equal === null ? '–' : equal ? 'byte-equal' : 'differ'} color={equal ? 'var(--ok)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'public key' },
            { color: 'var(--violet)', label: 'private key 🔒' },
            { color: 'var(--ok)', label: 'shared secret' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => setRound(round + 1)}>New key pairs</Button>
        </>,
      ]}
    >
      <div className="stage-pad dh-real">
        {!hasSubtle() ? (
          <p className="dh-weak">Web Crypto isn't available here (it needs https or localhost), so there's no real key agreement to show.</p>
        ) : result ? (
          <div className="dh-real-row">
            <Side name="Alice" side={result.alice} />
            <Side name="Bob" side={result.bob} />
          </div>
        ) : (
          <p className="dh-muted">Generating two key pairs…</p>
        )}
        <p className="dh-muted">
          Real ECDH on the P-256 curve, computed in your browser. Each side combines its own private key with the other's public key. Real
          protocols such as TLS 1.3 never use this secret directly: they feed it through a key-derivation function (HKDF) first.
        </p>
      </div>
    </StageFrame>
  );
}

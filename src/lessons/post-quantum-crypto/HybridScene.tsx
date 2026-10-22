import { useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { ecdhDerive, ecdhKeyPair, hasSubtle } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { KEM_BITS, ML_KEM_SECRET_BYTES, ML_KEM_SETS, P256_SHARE_BYTES, bitDistance, combine, decapsulate, encapsulate, flipBit, hybridShareBytes } from './kem';

const DEFAULT_SEED = 3;
const SHOWN_BYTES = 8;
const ECDH_BITS = 256;
type Flip = 'none' | 'ecdh' | 'kem';
const FLIP_OPTIONS = [
  { value: 'none' as const, label: 'No flip' },
  { value: 'ecdh' as const, label: 'Flip a bit of the ECDH secret' },
  { value: 'kem' as const, label: 'Flip a bit of the toy KEM secret' },
];
const NEEDS_SECURE = 'needs https or localhost: the real half (ECDH and HKDF) is unavailable here, so no combined key is shown. The toy half and the size table still work.';

interface Computed {
  base: Uint8Array;
  flipped: Uint8Array;
}

/** Scene 5: a real P-256 ECDH secret and a toy KEM secret combined by real HKDF, and what a hybrid costs on the wire. */
export function HybridScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [round, setRound] = useState(1);
  const [flip, setFlip] = useState<Flip>('none');
  const [index, setIndex] = useState(0);
  const secure = hasSubtle();

  const kem = useMemo(() => encapsulate(seed), [seed]);
  const recovered = decapsulate(kem.kp, kem.cts);
  const bitMax = flip === 'ecdh' ? ECDH_BITS - 1 : KEM_BITS - 1;
  const bit = Math.min(index, bitMax);

  const secret = useAsyncValue<Uint8Array | null>(async () => {
    const a = await ecdhKeyPair();
    const b = await ecdhKeyPair();
    if (!a || !b) return null;
    const secretA = await ecdhDerive(a.privateKey, b.publicKey);
    const secretB = await ecdhDerive(b.privateKey, a.publicKey);
    if (!secretA || !secretB) return null;
    return secretA.length === secretB.length && secretA.every((v, i) => v === secretB[i]) ? secretA : null;
  }, round);
  const result = useAsyncValue<Computed | null>(
    async () => {
      if (!secret) return null;
      const base = (await combine(secret, kem.secret))!;
      const flipped = flip === 'ecdh' ? (await combine(flipBit(secret, bit), kem.secret))! : flip === 'kem' ? (await combine(secret, kem.secret ^ (1 << (KEM_BITS - 1 - bit))))! : base;
      return { base, flipped };
    },
    `${round}|${seed}|${flip}|${bit}|${secret ? 'ready' : 'waiting'}`,
  );
  const changed = result && flip !== 'none' ? bitDistance(result.base, result.flipped) : null;

  const intro = !secure
    ? NEEDS_SECURE
    : result === null
      ? 'Making two fresh P-256 key pairs, then combining their shared secret with the toy KEM secret through HKDF.'
      : flip === 'none'
        ? 'The combined key comes from both secrets. Flip one bit of either input and watch the output change.'
        : `Flipping one bit of the ${flip === 'ecdh' ? 'ECDH' : 'toy KEM'} secret changed ${changed} of 256 output bits: both inputs matter.`;

  return (
    <StageFrame
      height={560}
      intro={intro}
      introKey={`hybrid|${secure}|${result === null}|${flip}|${changed}`}
      stats={
        <Stats>
          <Stat label="Toy KEM secret" value={`${recovered === kem.secret ? 'recovered' : 'lost'}`} color={recovered === kem.secret ? 'var(--ok)' : 'var(--bad)'} sub={`${KEM_BITS} bits sent as ${KEM_BITS} toy ciphertexts`} />
          <Stat label="Output bits changed" value={changed === null ? '–' : `${changed} of 256`} color={flip === 'none' ? undefined : 'var(--hi)'} sub={flip === 'none' ? 'no flip chosen' : 'by the one flipped input bit'} />
          <Stat label="Hybrid client share" value={`${hybridShareBytes(ML_KEM_SETS[1])} bytes`} sub={`${P256_SHARE_BYTES} classical + ${ML_KEM_SETS[1].publicKey} for ML-KEM-768 (from memory)`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'the classical (ECDH) secret', shape: 'square' }, { color: 'var(--violet)', label: 'the toy KEM secret', shape: 'square' }, { color: 'var(--hi)', label: 'the combined key', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <SeedField seed={seed} onSeed={setSeed} label="Toy KEM seed" />
          <Button onClick={() => setRound(round + 1)} softDisabled={!secure}>New ECDH key pairs</Button>
        </>,
        <>
          <Segmented<Flip> label="Flip one input bit" options={FLIP_OPTIONS} value={flip} onChange={setFlip} />
          {flip !== 'none' && <Slider label="which bit" value={bit} min={0} max={bitMax} onChange={setIndex} />}
          {!secure && <Hint tone="bad">{NEEDS_SECURE}</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad pq-stage">
        <div className="pq-hybrid-row">
          <div className="pq-hybrid-box is-info">
            <b>Classical secret (real)</b>
            <span>P-256 ECDH between two fresh key pairs made in this browser: 32 bytes, never shown.</span>
          </div>
          <div className="pq-hybrid-box is-violet">
            <b>Toy KEM secret</b>
            <span>{KEM_BITS} bits drawn from seed {seed}, sent as {KEM_BITS} toy ciphertexts and decrypted again. Not ML-KEM.</span>
          </div>
        </div>
        {result ? (
          <div className="pq-key">
            <b>Combined key: first {SHOWN_BYTES} of 32 bytes (a truncated digest)</b>
            <ByteGrid bytes={result.base.slice(0, SHOWN_BYTES)} perRow={8} toneOf={() => 'hi'} ariaLabel="First eight bytes of the combined key" />
            {flip !== 'none' && (
              <>
                <b>After flipping one bit: first {SHOWN_BYTES} bytes</b>
                <ByteGrid bytes={result.flipped.slice(0, SHOWN_BYTES)} perRow={8} toneOf={(i) => (result.flipped[i] === result.base[i] ? undefined : 'bad')} ariaLabel="First eight bytes after one input bit is flipped" />
              </>
            )}
          </div>
        ) : (
          secure && <p className="pq-note">Computing...</p>
        )}
        <p className="pq-note">The combiner is real HKDF-SHA256 with an empty salt and a fixed label, 32 bytes out. The combiner is real and the KEM is a toy: this is not ML-KEM, and the output is a demonstration, never a key to use.</p>
        <WideRegion minWidth={420} noun="table">
          <table className="pq-table" aria-label="ML-KEM sizes and the hybrid client share">
            <thead>
              <tr><th>set</th><th>public key</th><th>ciphertext</th><th>shared secret</th><th>hybrid client share</th><th>vs classical share</th></tr>
            </thead>
            <tbody>
              {ML_KEM_SETS.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{s.publicKey} bytes</td>
                  <td>{s.ciphertext} bytes</td>
                  <td>{ML_KEM_SECRET_BYTES} bytes</td>
                  <td>{P256_SHARE_BYTES} + {s.publicKey} = {hybridShareBytes(s)} bytes</td>
                  <td>about {Math.round(hybridShareBytes(s) / P256_SHARE_BYTES)} times</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <p className="pq-note">Deployed hybrids commonly pair X25519 (a 32-byte share) with ML-KEM-768 (from memory, verify), so these numbers show the effect on message size and are not a protocol encoding.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">ECDH on P-256 and HKDF-SHA256 run in this browser through Web Crypto</Provenance>
        <Provenance kind="toy" seed={seed}>the KEM is a toy: {KEM_BITS}-bit secret, q = 98, n = 4, not ML-KEM and not a candidate scheme</Provenance>
        <Provenance kind="from-memory">every ML-KEM size and name above, FIPS 203 (NIST, 2024) and the X25519 hybrids (verify against FIPS 203 and current TLS drafts)</Provenance>
        <ClaimLabel kind="practice">combining a classical and a post-quantum secret during the transition is common practice</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}

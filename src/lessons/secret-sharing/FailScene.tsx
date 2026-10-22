import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { BAD_SOURCE_CASE, BYTE_PRIME, HAND_COEFFS, HAND_SECRET, SOURCE_SUPPORT, makeShares, possibleSecrets, reconstructChecked, type Share, type Source } from './shamir';

const SOURCE_OPTIONS = [{ value: 'uniform' as const, label: 'Uniform coefficients' }, { value: 'zero-or-one' as const, label: 'Only 0 or 1 (broken)' }];
const ORIGINAL: Share[] = makeShares(BigInt(BYTE_PRIME), BigInt(HAND_SECRET), [...HAND_COEFFS], [1n, 2n, 3n]);
const toTexts = (shares: readonly Share[]) => shares.map((s) => ({ x: String(s.x), y: String(s.y) }));
const FIELD = { min: 0, max: BYTE_PRIME - 1 };

/** Scene 3: where it goes wrong: a corrupted share rebuilds a wrong secret silently, x = 0 and repeated x are refused, and a bad coefficient source shrinks the secret's candidates. */
export function FailScene({ picker }: { picker: ReactNode }) {
  const [texts, setTexts] = useState(() => toTexts(ORIGINAL));
  const [values, setValues] = useState<readonly Share[]>(ORIGINAL);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<Source>('uniform');

  const edit = (i: number, field: 'x' | 'y', text: string) => {
    setTexts(texts.map((t, j) => (j === i ? { ...t, [field]: text } : t)));
    const parsed = parseBoundedInt(text, FIELD);
    if (!parsed.ok) return setError(`Share ${i + 1} ${field}: ${parsed.error}`);
    setError(null);
    setValues(values.map((s, j) => (j === i ? { ...s, [field]: BigInt(parsed.value) } : s)));
  };
  const reset = () => {
    setTexts(toTexts(ORIGINAL));
    setValues(ORIGINAL);
    setError(null);
  };

  const checked = useMemo(() => reconstructChecked(values), [values]);
  const changed = values.some((s, i) => s.y !== ORIGINAL[i].y || s.x !== ORIGINAL[i].x);
  const bad = BAD_SOURCE_CASE;
  const badShares = useMemo(() => makeShares(BigInt(bad.p), BigInt(bad.secret), [...bad.coeffs], [...bad.xs]), [bad]);
  const possible = useMemo(() => possibleSecrets(bad.p, badShares, SOURCE_SUPPORT[source](bad.p)), [bad.p, badShares, source]);

  const intro = !checked.ok
    ? checked.error
    : checked.secret === BigInt(HAND_SECRET)
      ? `Rebuilt ${checked.secret} from the three shares, the secret they were made from.`
      : `Rebuilt ${checked.secret} with no error, but the secret was ${HAND_SECRET}: Shamir's scheme has no integrity check, so a wrong share gives a wrong secret silently.`;

  return (
    <StageFrame
      height={540}
      intro={intro}
      introKey={`fail|${values.map((s) => `${s.x}:${s.y}`).join(',')}|${source}`}
      stats={
        <Stats>
          <Stat label="Rebuilt secret" value={checked.ok ? String(checked.secret) : 'refused'} color={!checked.ok ? 'var(--bad)' : checked.secret === BigInt(HAND_SECRET) ? 'var(--ok)' : 'var(--bad)'} sub={checked.ok ? (changed ? 'no error raised' : 'the original shares') : 'see the message'} />
          <Stat label="Original secret" value={HAND_SECRET} sub="what the shares were made from" />
          <Stat label="Secrets possible" value={`${possible.length} of ${bad.p}`} color={possible.length === 1 ? 'var(--bad)' : 'var(--ok)'} sub={`two shares of a 3-of-n scheme, ${source === 'uniform' ? 'uniform' : '0-or-1'} coefficients`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'the right secret, or every secret still possible', shape: 'square' }, { color: 'var(--bad)', label: 'a wrong secret, a refusal, or one candidate left', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented<Source> label="Coefficient source (GF(7) case)" options={SOURCE_OPTIONS} value={source} onChange={setSource} />
        </>,
        <>
          {texts.map((t, i) => (
            <ControlGroup key={i} label={`Share ${i + 1}`} inline>
              <TextField label="x" value={t.x} onChange={(v) => edit(i, 'x', v)} onBlur={() => setTexts(texts.map((q, j) => (j === i ? { x: String(values[i].x), y: String(values[i].y) } : q)))} width={64} spellCheck={false} />
              <TextField label="y" value={t.y} onChange={(v) => edit(i, 'y', v)} onBlur={() => setTexts(texts.map((q, j) => (j === i ? { x: String(values[i].x), y: String(values[i].y) } : q)))} width={64} spellCheck={false} />
            </ControlGroup>
          ))}
          <Button onClick={reset}>Restore the original shares</Button>
          {error && <Hint tone="bad">{error} Keeping the last valid value.</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad ss-stage">
        <p className="ss-note">
          (a) Change share 3 from 84 to 85 and rebuild from shares 1, 2 and 3: the error of 1 is multiplied by the Lagrange coefficient of share 3 and the answer is off by the same amount, with no warning. Verifiable secret sharing, which adds a check, is named here and not shown. (b) Give two shares the same x, or use x = 0: both are refused.
        </p>
        <div className="ss-case">
          <b>(c) A bad coefficient source, in GF({bad.p}) with threshold 3.</b>{' '}
          The secret is {bad.secret} and the coefficients are {String(bad.coeffs[0])} and {String(bad.coeffs[1])}, so f = {bad.secret} + x + x^2 and two shares are {badShares.map((s) => `(${s.x}, ${s.y})`).join(' and ')}. With {source === 'uniform' ? 'uniform' : 'only 0 or 1'} coefficients the secrets with non-zero probability are{' '}
          <b className={possible.length === 1 ? 'tone-bad' : 'tone-ok'}>{possible.length} of {bad.p}</b>: {possible.join(', ')}. Secrecy needs uniformly random coefficients, which is what a CSPRNG is for (see <code>randomness-csprng</code>); the seed here is only for reproducibility.
        </div>
        <p className="ss-note">The guess chance from k - 1 shares is 1/7 per guess in GF(7) and 1/257 for a byte in GF(257).</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">GF(257) is 9 bits and GF(7) is 3 bits: toy fields; a real vault uses a large field or bytes over GF(2^8), a CSPRNG and authenticated shares. Nothing here splits a real key</Provenance>
        <ClaimLabel kind="theorem">secrecy of k - 1 shares needs uniformly random coefficients: argued, not run here for large fields; this scene shows what a tiny coefficient support does to the hand case</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}

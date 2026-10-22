import { useMemo, useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { power } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import {
  BYTE_PRIME, BYTE_SCHEMES, DEFAULT_WORD, HAND_COEFFS, HAND_SECRET, bits, bytesText, coefficientsFor, guessChance, interpolateAnyway, parseWord, rebuild, shareBytes, signed,
} from './shamir';

type Kind = 'byte' | 'word';
const KIND_OPTIONS = [{ value: 'byte' as const, label: 'A byte' }, { value: 'word' as const, label: 'A short word' }];
const SCHEME_OPTIONS = BYTE_SCHEMES.map((s) => ({ value: `${s.k}-${s.n}`, label: `${s.k} of ${s.n}` }));
const DEFAULT_SEED = 3;
const DEFAULT_SCHEME = '3-5';
const DEFAULT_CHOSEN: readonly number[] = [];

/** Scene 2: share a byte (or a short word) over GF(257), pick any subset of shares and rebuild, or fail to. */
export function ByteScene({ picker }: { picker: ReactNode }) {
  const [kind, setKind] = useState<Kind>('byte');
  const [scheme, setScheme] = useState(DEFAULT_SCHEME);
  const [byteText, setByteText] = useState(String(HAND_SECRET));
  const [wordText, setWordText] = useState(DEFAULT_WORD);
  const [secret, setSecret] = useState<number[]>([HAND_SECRET]);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [override, setOverride] = useState<readonly bigint[] | null>(HAND_COEFFS);
  const [chosen, setChosen] = useState<readonly number[]>(DEFAULT_CHOSEN);
  const [anyway, setAnyway] = useState<readonly number[] | null>(null);
  const [reconstructed, setReconstructed] = useState<readonly number[] | null>(null);

  const [k, n] = scheme.split('-').map(Number);
  const coeffs = useMemo(() => coefficientsFor(secret, k, seed, override), [secret, k, seed, override]);
  const shares = useMemo(() => shareBytes(secret, k, n, coeffs), [secret, k, n, coeffs]);
  const result = reconstructed && reconstructed.join() === chosen.join() ? rebuild(shares, chosen) : null;
  const guess = anyway && anyway.join() === chosen.join() ? interpolateAnyway(shares, chosen) : null;

  const reset = () => {
    setChosen(DEFAULT_CHOSEN);
    setReconstructed(null);
    setAnyway(null);
  };
  const applyByte = (text: string) => {
    setByteText(text);
    const parsed = parseBoundedInt(text, { min: 0, max: BYTE_PRIME - 2 });
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    setSecret([parsed.value]);
    if (parsed.value !== HAND_SECRET) setOverride(null);
    else setOverride(HAND_COEFFS);
    reset();
  };
  const applyWord = (text: string) => {
    setWordText(text);
    const parsed = parseWord(text);
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    setSecret(parsed.bytes);
    setOverride(null);
    reset();
  };
  const changeKind = (next: Kind) => {
    setKind(next);
    if (next === 'byte') applyByte(byteText);
    else applyWord(wordText);
  };
  const toggle = (x: number) => {
    setChosen(chosen.includes(x) ? chosen.filter((c) => c !== x) : [...chosen, x].sort((a, b) => a - b));
  };
  const changeScheme = (value: string) => {
    setScheme(value);
    setOverride(null);
    reset();
  };

  const showGuess = guess !== null && secret.length > 0;
  const guessWrong = showGuess && chosen.length < k;
  const intro = result
    ? result.ok
      ? `${chosen.length} shares rebuild ${kind === 'byte' ? result.secretBytes[0] : `"${bytesText(result.secretBytes)}"`}: the Lagrange coefficients are ${result.basis.map((b) => signed(b, BigInt(BYTE_PRIME))).join(', ')}.`
      : result.error
    : showGuess
      ? `Interpolating ${chosen.length} share${chosen.length === 1 ? '' : 's'} anyway gives ${kind === 'byte' ? guess![0] : `"${bytesText(guess!)}"`}, compared with ${kind === 'byte' ? secret[0] : `"${bytesText(secret)}"`} (the truth)${guessWrong ? `: a wrong answer with probability ${BYTE_PRIME - 1}/${BYTE_PRIME}` : ', which is a normal rebuild because the threshold is met'}.`
      : `Share ${kind === 'byte' ? 'the byte' : 'the word'} ${k}-of-${n} over GF(${BYTE_PRIME}), a ${bits(BYTE_PRIME)}-bit toy field, then pick any shares and rebuild.`;

  return (
    <StageFrame
      height={600}
      intro={intro}
      introKey={`byte|${scheme}|${secret.join(',')}|${seed}|${chosen.join(',')}|${result ? 'r' : ''}|${guess ? 'g' : ''}`}
      stats={
        <Stats>
          <Stat label="Scheme" value={`${k} of ${n}`} sub={`GF(${BYTE_PRIME}): ${bits(BYTE_PRIME)} bits, a toy`} />
          <Stat label="Shares chosen" value={`${chosen.length} of ${n}`} color={chosen.length >= k ? 'var(--ok)' : 'var(--info)'} sub={chosen.length >= k ? 'enough to rebuild' : `${k - chosen.length} more needed`} />
          <Stat label="Guess from k - 1 shares" value={guessChance(BYTE_PRIME)} sub={`a 256-bit secret in a 256-bit field would be 1/${power(256)}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'a share', shape: 'square' }, { color: 'var(--violet)', label: 'the rebuilt polynomial', shape: 'square' }, { color: 'var(--bad)', label: 'a refusal', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented<Kind> label="Secret" options={KIND_OPTIONS} value={kind} onChange={changeKind} />
          <Segmented<string> label="Scheme" options={SCHEME_OPTIONS} value={scheme} onChange={changeScheme} />
        </>,
        <>
          {kind === 'byte' ? (
            <TextField label="Secret byte (0 to 255)" value={byteText} onChange={applyByte} onBlur={() => { setByteText(String(secret[0])); setError(null); }} width={90} spellCheck={false} />
          ) : (
            <TextField label={`Word (1 to 6 printable characters, a fake: never type a real secret)`} value={wordText} onChange={applyWord} onBlur={() => { setWordText(bytesText(secret)); setError(null); }} width={140} maxLength={6} spellCheck={false} />
          )}
          <SeedField seed={seed} onSeed={(s) => { setSeed(s); setOverride(null); reset(); }} />
          <Button onClick={() => { setOverride(null); reset(); }}>Draw new coefficients from the seed</Button>
          {error && <Hint tone="bad">{error}</Hint>}
        </>,
        <>
          <ControlGroup label="Choose shares">
            {Array.from({ length: n }, (_, i) => i + 1).map((x) => (
              <ChipButton key={x} on={chosen.includes(x)} onClick={() => toggle(x)}>{x}</ChipButton>
            ))}
          </ControlGroup>
          <Button variant="primary" onClick={() => setReconstructed(chosen)}>Reconstruct</Button>
          <Button onClick={() => setAnyway(chosen)} softDisabled={chosen.length === 0}>Interpolate anyway</Button>
        </>,
      ]}
    >
      <div className="stage-pad ss-stage">
        <div className="ss-shares" role="list" aria-label="The shares">
          {shares.shares.map((row, i) => (
            <div key={i} role="listitem" className={`ss-share ${chosen.includes(i + 1) ? 'is-on' : ''}`}>
              <b>share {i + 1}</b>
              <span>({i + 1}, {kind === 'byte' ? String(row[0]) : row.map(String).join(' ')})</span>
            </div>
          ))}
        </div>
        <p className="ss-note">Each share is one point (x, y) of the polynomial; a word has one polynomial per byte, all at the same x-values. The coefficients come from seed {seed} so the page is reproducible; a real system uses a CSPRNG.</p>
        {result && (
          <ConsolePanel
            title="Lagrange interpolation at 0"
            lines={result.ok ? [`basis values L_i(0): ${result.basis.map((b) => signed(b, BigInt(BYTE_PRIME))).join(', ')}`, `s = ${result.sum}`, `rebuilt: ${kind === 'byte' ? result.secretBytes[0] : bytesText(result.secretBytes)}`] : [{ text: result.error, tone: 'bad' }]}
          />
        )}
        {showGuess && (
          <ConsolePanel title="interpolate anyway" lines={[`the unique polynomial of degree below ${chosen.length} through the ${chosen.length} chosen share${chosen.length === 1 ? '' : 's'}, read at 0:`, `${kind === 'byte' ? guess![0] : bytesText(guess!)} (the truth was ${kind === 'byte' ? secret[0] : bytesText(secret)})`]} />
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy" seed={seed}>GF(257) is 9 bits: a toy field; nothing here splits a real key, and every word is a lesson-authored fake</Provenance>
        <Provenance kind="from-memory">some secrets-management products split an unseal or master key with Shamir shares, and real implementations commonly work over GF(2^8) bytewise (no product named; verify before relying on it)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

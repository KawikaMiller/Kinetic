import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { SeedField } from '../../components/SeedField';
import { ChipButton, ClaimLabel, ControlGroup, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import {
  B_RANGE, BROKEN_SEED, BITS, DEFAULT_PARAMS, DEFAULT_SEED, FAILING_MEAN_PERCENT, FAILING_PARAMS, FAILING_SEEDS_WITH_ANY_FAILURE, SEVERE_FAILURES, HALF, M_RANGE, N_RANGE, NOISE_LIMIT, Q, SEARCH_N, SEARCH_SPACE, SWEEP_TRIALS,
  candidateSearch, encryptByte, keyFor, messageBits, sweep, trialStream, type LweParams,
} from './lwe';

const fmt = (n: number) => n.toLocaleString('en-US');

/** Scene 3: a Regev-style toy over Z_98: encrypt a byte bit by bit, watch the noise, and sweep 1,000 seeded encryptions. */
export function LweScene({ picker }: { picker: ReactNode }) {
  const [p, setP] = useState<LweParams>(DEFAULT_PARAMS);
  const [seed, setSeed] = useState(DEFAULT_SEED);

  const kp = useMemo(() => keyFor(p, seed), [p, seed]);
  const rows = useMemo(() => encryptByte(kp, messageBits(seed), trialStream(seed)), [kp, seed]);
  const result = useMemo(() => sweep(p, seed), [p, seed]);
  const search = useMemo(() => (p.n === SEARCH_N ? candidateSearch(kp, p.B) : null), [kp, p]);
  const bad = rows.filter((r) => !r.ok).length;
  const worst = p.m * p.B;
  const isFailingPreset = p.n === FAILING_PARAMS.n && p.m === FAILING_PARAMS.m && p.B === FAILING_PARAMS.B;

  const intro =
    result.failures === 0
      ? `With n = ${p.n}, m = ${p.m} and noise bound B = ${p.B}, decryption failed on 0 of ${fmt(SWEEP_TRIALS)} seeded encryptions: the noise sum is at most m x B = ${worst}${worst <= NOISE_LIMIT ? `, which cannot pass ${NOISE_LIMIT}` : ', and it did not pass 24 on these seeds'}.`
      : `Decryption failed on ${fmt(result.failures)} of ${fmt(SWEEP_TRIALS)} seeded encryptions (${((100 * result.failures) / SWEEP_TRIALS).toFixed(1)}%): the noise passed ${NOISE_LIMIT}, the first such case being a centred noise of ${result.firstFailure!.epsCentred}.`;

  const setParam = (patch: Partial<LweParams>) => setP({ ...p, ...patch });

  return (
    <StageFrame
      height={540}
      intro={intro}
      introKey={`lwe|${p.n}|${p.m}|${p.B}|${seed}`}
      stats={
        <Stats>
          <Stat label="Failed of 1,000" value={result.failures} color={result.failures ? 'var(--bad)' : 'var(--ok)'} sub={`seed ${seed}, n ${p.n}, m ${p.m}, B ${p.B}`} />
          <Stat label="This byte" value={`${BITS - bad} of ${BITS} right`} color={bad ? 'var(--bad)' : 'var(--ok)'} sub="each bit is its own ciphertext" />
          <Stat label="Noise ceiling m x B" value={worst} color="var(--info)" sub={`a bit decodes right while |noise| <= ${NOISE_LIMIT} (q = ${Q})`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'the noise ceiling m x B', shape: 'square' }, { color: 'var(--ok)', label: 'a correct bit', shape: 'square' }, { color: 'var(--bad)', label: 'a failed bit', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <Slider label="n: dimension" value={p.n} min={N_RANGE[0]} max={N_RANGE[1]} onChange={(n) => setParam({ n })} />
          <Slider label="m: samples" value={p.m} min={M_RANGE[0]} max={M_RANGE[1]} onChange={(m) => setParam({ m })} />
          <Slider label="B: noise bound" value={p.B} min={B_RANGE[0]} max={B_RANGE[1]} onChange={(B) => setParam({ B })} />
        </>,
        <ControlGroup key="presets" label="Try">
          <ChipButton on={p.n === DEFAULT_PARAMS.n && p.m === DEFAULT_PARAMS.m && p.B === DEFAULT_PARAMS.B && seed === DEFAULT_SEED} onClick={() => { setP(DEFAULT_PARAMS); setSeed(DEFAULT_SEED); }}>default (never fails)</ChipButton>
          <ChipButton on={p.n === FAILING_PARAMS.n && p.m === FAILING_PARAMS.m && p.B === FAILING_PARAMS.B && seed === BROKEN_SEED} onClick={() => { setP(FAILING_PARAMS); setSeed(BROKEN_SEED); }}>failing preset (seed {BROKEN_SEED})</ChipButton>
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad pq-stage">
        <p className="pq-note">
          Public key: {p.m} rows (a, b) with b = a . s + e mod {Q}, e drawn from -{p.B}..{p.B}. To encrypt a bit, add up a random subset of the rows and add {HALF} for a 1. To decrypt, subtract u . s: what is left is the noise sum, plus {HALF} for a 1. The bit is 1 exactly when the remainder is strictly closer to {HALF} than to 0.
        </p>
        <p className="pq-note">
          The modulus {Q} is not prime on purpose: {Q} / 4 = {Q / 4} is not a whole number, so no remainder sits exactly on the decoding boundary and the rule has no ties. (The ML-KEM modulus is prime and much larger.)
        </p>
        {isFailingPreset && (
          <p className="pq-note">
            About this preset: seed {BROKEN_SEED} is the lowest seed on which at least {SEVERE_FAILURES} of the {fmt(SWEEP_TRIALS)} encryptions fail (5%), chosen to show a failure. Across seeds 0 to 999 this preset fails on at least one encryption for {fmt(FAILING_SEEDS_WITH_ANY_FAILURE)} of 1,000 seeds and averages {FAILING_MEAN_PERCENT.toFixed(1)}% of encryptions, so seed {BROKEN_SEED} is a worse draw than typical, not the usual rate.
          </p>
        )}
        <div className="pq-bits" role="list" aria-label="One byte, each bit encrypted on its own">
          {rows.map((r) => (
            <div key={r.index} role="listitem" className={`pq-bit ${r.ok ? 'is-ok' : 'is-bad'}`}>
              <b>bit {r.index + 1}: sent {r.sent}</b>
              <span>noise {r.epsCentred >= 0 ? '+' : '-'}{Math.abs(r.epsCentred)}{r.eps !== r.epsCentred ? ` (${r.eps} wrapped)` : ''}</span>
              <span>remainder {r.d}</span>
              <span>decoded {r.got}: {r.ok ? 'ok' : 'failed'}</span>
            </div>
          ))}
        </div>
        <div className="pq-search">
          <b>Toy search meter</b>{' '}
          {search ? (
            <span>
              all {fmt(SEARCH_SPACE)} secrets for n = {SEARCH_N} were tried: {search.candidates} fit the {p.m} public rows within +-{p.B}{search.containsTrue ? ', the true secret among them' : ''}. This brute force works only because the toy is tiny.
            </span>
          ) : (
            <span>offered for n = {SEARCH_N} only ({fmt(SEARCH_SPACE)} secrets); set n to {SEARCH_N} to see how many secrets fit.</span>
          )}
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy" seed={seed}>q = {Q}, n = {p.n}: a {Math.ceil(Math.log2(Q))}-bit modulus and not a real parameter set; a real system uses a CSPRNG and a real scheme, and this is not ML-KEM</Provenance>
        <Provenance kind="from-memory">that noisy linear equations stay hard at large size is a claim from the literature; this page shows noise and failure, not hardness</Provenance>
        <ClaimLabel kind="research">learning with errors is the problem behind lattice schemes such as ML-KEM (from memory, verify against FIPS 203 and its references)</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}

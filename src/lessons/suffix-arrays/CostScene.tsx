import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import {
  ALPHABETS, COST_N_DEFAULT, COST_N_MAX, COST_N_MIN, DEFAULT_SEED, buildSuffixArray, costSweep, randomText, type Alphabet,
} from './model';

const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 260;
const ALPHABET_OPTIONS = ALPHABETS.map((k) => ({ value: k, label: `${k} letters` }));
const PLOT_Y_MIN = 10;

/** Scene 4: what building the array costs, counted from real comparison sorts of a seeded random string and of a^n. */
export function CostScene({ picker }: { picker: ReactNode }) {
  const [alphabet, setAlphabet] = useState<Alphabet>(4);
  const [n, setN] = useState(COST_N_DEFAULT);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const random = useMemo(() => buildSuffixArray(randomText(seed, alphabet, n)).cost, [seed, alphabet, n]);
  const worst = useMemo(() => buildSuffixArray('a'.repeat(n)).cost, [n]);
  const sweep = useMemo(() => costSweep(seed, alphabet), [seed, alphabet]);
  const top = 10 ** Math.ceil(Math.log10(Math.max(...sweep.map((p) => p.worst.charsCompared))));

  return (
    <StageFrame
      height={520}
      intro={
        <>
          For n = {n}, sorting the suffixes of a random {alphabet}-letter string takes {random.comparisons.toLocaleString('en-US')} comparator calls and looks at {random.charsCompared.toLocaleString('en-US')} characters;
          the worst case a^n looks at {worst.charsCompared.toLocaleString('en-US')}. This counts comparisons, not CPU time.
        </>
      }
      introKey={`cost|${n}|${alphabet}|${seed}`}
      stats={
        <Stats>
          <Stat label="Random: calls" value={random.comparisons.toLocaleString('en-US')} color="var(--info)" sub="comparator calls" />
          <Stat label="Random: characters" value={random.charsCompared.toLocaleString('en-US')} color="var(--ok)" sub={`${(random.charsCompared / Math.max(1, random.comparisons)).toFixed(1)} per call`} />
          <Stat label="a^n: characters" value={worst.charsCompared.toLocaleString('en-US')} color="var(--bad)" sub={`${(worst.charsCompared / Math.max(1, worst.comparisons)).toFixed(1)} per call, ${worst.comparisons.toLocaleString('en-US')} calls`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'comparator calls (random string)', shape: 'line' },
            { color: 'var(--ok)', label: 'characters compared (random string)', shape: 'line' },
            { color: 'var(--bad)', label: 'characters compared (a^n)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Alphabet" value={alphabet} onChange={setAlphabet} options={ALPHABET_OPTIONS} />
          <Slider label="n" value={n} min={COST_N_MIN} max={COST_N_MAX} onChange={setN} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="sa-stage stage-pad">
        <Plot2D
          x={{ domain: [COST_N_MIN, COST_N_MAX], log: true, label: 'text length n' }}
          y={{ domain: [PLOT_Y_MIN, top], log: true, label: 'count' }}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          ariaLabel="Comparator calls and characters compared against text length, for a seeded random string and for a repeated letter"
        >
          <Curve points={sweep.map((p) => [p.n, p.random.comparisons] as const)} tone="info" />
          <Curve points={sweep.map((p) => [p.n, p.random.charsCompared] as const)} tone="ok" />
          <Curve points={sweep.map((p) => [p.n, p.worst.charsCompared] as const)} tone="bad" />
          <VLine at={n} label={`n = ${n}`} />
          <Points data={[{ x: n, y: Math.max(PLOT_Y_MIN, random.comparisons), tone: 'info' }, { x: n, y: Math.max(PLOT_Y_MIN, random.charsCompared), tone: 'ok' }, { x: n, y: Math.max(PLOT_Y_MIN, worst.charsCompared), tone: 'bad' }]} />
        </Plot2D>
        <p className="sa-note">
          A random string differs from its neighbours after a few letters, so each comparator call stops early. In a^n two suffixes agree until the shorter one ends, so a call looks at a long stretch of characters (the per-call figure above) and the whole sort is far costlier.
          Linear-time constructions exist and are named, not built, here: <Provenance kind="from-memory">SA-IS (Nong, Zhang and Chan, 2009) and DC3</Provenance> (verify against the original papers).
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>a seeded random string; every count comes from a real merge sort of the suffixes</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

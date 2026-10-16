import { useMemo, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { kmpSearch, naiveSearch } from './kmp';
import { MATCH_PRESETS, OPENING } from './presets';
import { PairControls } from './PairControls';
import { SWEEP_MAX_N, SWEEP_MIN_N, sweep } from './sweep';
import { usePair } from './usePair';

const COUNT_PRESETS = [
  { id: 'aaaab', label: 'aaaab in 20 a', ...OPENING.count },
  ...MATCH_PRESETS.filter((p) => p.id !== 'overlap'),
];

/** Scene 4: both algorithms on one input, one unit (character comparisons), and the 2n argument from two counters. */
export function CountScene({ picker }: { picker: ReactNode }) {
  const state = usePair(OPENING.count);
  const { text, pattern } = state.pair;
  const naive = useMemo(() => naiveSearch(text, pattern), [text, pattern]);
  const kmp = useMemo(() => kmpSearch(text, pattern), [text, pattern]);
  const series = useMemo(() => sweep(), []);
  const n = text.length;
  const at = Math.min(Math.max(n, SWEEP_MIN_N), SWEEP_MAX_N);
  const top = Math.max(...series.map((s) => s.naiveWorst), 2 * SWEEP_MAX_N);

  return (
    <StageFrame
      height={460}
      intro={
        <>
          On this input the naive scan makes {naive.comparisons} character comparisons and KMP makes {kmp.comparisons}, against a bound of 2n = {2 * n} for KMP. Both count every compare, including the ones that cause a fall-back; this is character comparisons, not CPU time.
        </>
      }
      introKey={[naive.comparisons, kmp.comparisons, n]}
      stats={
        <Stats>
          <Stat label="Naive" value={naive.comparisons} color="var(--bad)" sub="character comparisons" />
          <Stat label="KMP" value={kmp.comparisons} color="var(--ok)" sub={`bound 2n = ${2 * n}`} />
          <Stat label="Text advances" value={kmp.advances} color="var(--info)" sub={`at most n = ${n}`} />
          <Stat label="Fall-backs" value={kmp.fallbacks} color="var(--violet)" sub={`at most the advances: ${kmp.advances}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'naive', shape: 'line' },
            { color: 'var(--ok)', label: 'KMP', shape: 'line' },
            { color: 'var(--info)', label: 'KMP on a random two-letter text', shape: 'line' },
            { color: 'var(--dim)', label: '2n', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PairControls state={state} presets={COUNT_PRESETS} />
        </>,
      ]}
    >
      <div className="km-stage stage-pad">
        <div className="km-bars">
          <Bar value={naive.comparisons} max={Math.max(1, naive.comparisons, kmp.comparisons)} tone="bad" label="Naive" trailing={naive.comparisons} />
          <Bar value={kmp.comparisons} max={Math.max(1, naive.comparisons, kmp.comparisons)} tone="ok" label="KMP" trailing={kmp.comparisons} />
        </div>
        <p className="km-note">
          Why at most 2n: the text pointer only moves forward, so it advances at most n times ({kmp.advances} here). Every fall-back lowers j, and j only rises when the text pointer advances, so there are at most as many fall-backs as advances ({kmp.fallbacks} here). Each comparison is one or the other: {kmp.advances} + {kmp.fallbacks} = {kmp.comparisons}.
        </p>
        <Plot2D
          x={{ domain: [SWEEP_MIN_N, SWEEP_MAX_N], label: 'text length n' }}
          y={{ domain: [0, top], label: 'comparisons' }}
          ariaLabel="Comparisons against text length for the naive scan and KMP on a worst-case and a random pair"
        >
          <Curve points={series.map((s) => [s.n, s.naiveWorst] as const)} tone="bad" />
          <Curve points={series.map((s) => [s.n, s.kmpWorst] as const)} tone="ok" />
          <Curve points={series.map((s) => [s.n, s.kmpRandom] as const)} tone="info" dashed />
          <Curve fn={(x) => 2 * x} tone="dim" dashed />
          <VLine at={at} />
          <Points data={[{ x: at, y: series[at - SWEEP_MIN_N].naiveWorst, tone: 'bad' }, { x: at, y: series[at - SWEEP_MIN_N].kmpWorst, tone: 'ok' }]} />
        </Plot2D>
        <p className="km-note">The curves are real runs on the worst case for the naive scan (a^n against aaaab; KMP stays under its own 2n bound there) and on a seeded random two-letter text against aaab; the marker sits at your text length (clamped to the plot).</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: both counts and every curve come from running the algorithms; a built-in indexOf may use other methods</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

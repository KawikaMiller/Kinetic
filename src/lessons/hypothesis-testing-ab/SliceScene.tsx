import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Hint, Legend, Provenance, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { VERDICT_TONE, pText, pointsText, sliceCaption, verdictSays } from './frames';
import {
  SLICES, SLICE_DEFAULT, SLICE_REPLICATES, SLICE_VISITORS, anySignificantRate, familyWiseRate, significantSlices, sliceAlpha, slicePValues, sliceRun,
  verdictKind,
} from './model';

const SLICE_OPTIONS: Option<number>[] = Array.from({ length: SLICES }, (_, i) => ({ value: i, label: String(i + 1) }));

export function SliceScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(SLICE_DEFAULT.seed);
  const [bonferroni, setBonferroni] = useState(SLICE_DEFAULT.bonferroni);
  const [selected, setSelected] = useState(0);

  const run = useMemo(() => sliceRun(seed), [seed]);
  const pValues = useMemo(() => slicePValues(seed), [seed]);
  const threshold = sliceAlpha(bonferroni);
  const { significant, bWins } = significantSlices(run, threshold);
  const empirical = anySignificantRate(pValues, threshold);
  const chosen = run[selected];
  const chosenKind = verdictKind(chosen.test, 0, threshold);

  useIntroCaption(sliceCaption(run, significant, bWins, threshold, empirical, SLICE_REPLICATES), [run, threshold, empirical]);

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Slices with p below threshold" value={`${significant.length} of ${SLICES}`} color={significant.length > 0 ? 'var(--bad)' : undefined} sub={[`threshold ${sig(threshold, 2)}`, `${bWins.length} with B ahead`]} />
          <Stat
            label="Chance of at least one"
            value={pctText(familyWiseRate(SLICES, threshold))}
            sub={[`1 − (1 − ${sig(threshold, 2)})^${SLICES}, for ${SLICES} fair tests`, `${pctText(empirical)} of ${SLICE_REPLICATES.toLocaleString('en-US')} simulated A/A experiments`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a slice that looks significant (it is noise)' },
            { color: 'var(--hi)', label: 'the slice you are looking at' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Correction" value={bonferroni} onChange={setBonferroni} off="None" on={`Bonferroni: α ÷ ${SLICES}`} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <Segmented label="Slice" value={selected} onChange={setSelected} options={SLICE_OPTIONS} />
        </>,
      ]}
    >
      <div className="ab-stage stage-pad">
        <Box className="ab-slice">
          <SectionTitle hint={`slice ${selected + 1} of ${SLICES}`}>{chosen.name}</SectionTitle>
          <p>
            A converted {chosen.arms.conversionsA} of {SLICE_VISITORS.toLocaleString('en-US')}, B {chosen.arms.conversionsB}: B − A is{' '}
            {pointsText(chosen.test.diff)}, p = {chosen.test.p === null ? 'undefined' : pText(chosen.test.p)}.{' '}
            <span className={VERDICT_TONE[chosenKind] ? `ab-${VERDICT_TONE[chosenKind]}` : ''}>{verdictSays(chosenKind)}.</span>
          </p>
        </Box>
        <Box className="ab-slices">
          <SectionTitle hint="every slice is the same A/A data: nothing differs">All {SLICES} slices</SectionTitle>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>slice (invented)</th><th>B − A</th><th>p</th></tr>
            </thead>
            <tbody>
              {run.map((s, i) => {
                const isSignificant = significant.includes(i);
                return (
                  <tr key={s.name} className={`${i === selected ? 'ab-picked' : ''} ${isSignificant ? 'ab-flagged' : ''}`}>
                    <td>{i + 1}</td>
                    <td>{s.name}</td>
                    <td>{pointsText(s.test.diff)}</td>
                    <td>{s.test.p === null ? '–' : pText(s.test.p)}{isSignificant ? ' ✱' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Hint tone="muted" block>✱ = below the threshold. In this experiment no variant differs anywhere, so every ✱ is a false positive.</Hint>
        </Box>
        <div className="ab-chips">
          <Provenance kind="simulated" seed={seed}>20 seeded A/A slices of {SLICE_VISITORS.toLocaleString('en-US')} visitors per arm</Provenance>
          <Provenance kind="invented">the countries and devices are made up</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}

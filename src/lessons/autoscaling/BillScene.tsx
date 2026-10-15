import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { billCaption, money, priceNote } from './frames';
import {
  CONTROLLER_DEFAULT, POLICIES, POLICY_NAME, PRESETS, PRESET_NAME, SCENE_DEFAULT, WARMUP_RANGE, bill, cost, runFleet, type Policy, type Preset,
} from './model';

const POLICY_OPTIONS = POLICIES.map((p) => ({ value: p, label: POLICY_NAME[p] }));
const PRESET_OPTIONS = PRESETS.map((p) => ({ value: p, label: PRESET_NAME[p] }));

export function BillScene({ picker }: { picker: ReactNode }) {
  const [policy, setPolicy] = useState<Policy>('reactive');
  const [warmupMin, setWarmupMin] = useState(CONTROLLER_DEFAULT.warmupMin);
  const [seed, setSeed] = useState(SCENE_DEFAULT.seed);
  const [focus, setFocus] = useState<Preset>('daily');
  const bills = useMemo(
    () => PRESETS.map((preset) => ({ preset, bill: bill(runFleet(preset, { ...CONTROLLER_DEFAULT, warmupMin, policy }, seed)) })),
    [policy, warmupMin, seed],
  );
  const shown = bills.find((b) => b.preset === focus)!;

  useIntroCaption(billCaption(shown.preset, shown.bill), [shown]);

  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a bill with no violation minutes' },
            { color: 'var(--bad)', label: 'violation minutes: the saving\'s price' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Policy" value={policy} onChange={setPolicy} options={POLICY_OPTIONS} />
          <Segmented label="Read the caption for" value={focus} onChange={setFocus} options={PRESET_OPTIONS} />
        </>,
        <>
          <Slider label="Warm-up" value={warmupMin} {...WARMUP_RANGE} format={(v) => `${v} min`} onChange={setWarmupMin} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="as-stage stage-pad">
        <Box className="as-table-box">
          <SectionTitle hint={`day 2, ${priceNote}`}>Autoscaled against a fleet fixed for the busiest minute</SectionTitle>
          <div className="as-table-wrap">
            <table className="data-table as-table">
              <thead>
                <tr>
                  <th>traffic</th>
                  <th>autoscaled</th>
                  <th>fixed fleet</th>
                  <th>saved</th>
                  <th>violation minutes</th>
                </tr>
              </thead>
              <tbody>
                {bills.map(({ preset, bill: b }) => (
                  <tr key={preset} className={preset === focus ? 'as-picked' : ''}>
                    <th scope="row" className="keep-case">{PRESET_NAME[preset]}</th>
                    <td>{money(cost(b.autoHours))}</td>
                    <td>{money(cost(b.staticHours))} <span className="as-dim">({b.staticInstances} instances)</span></td>
                    <td>{b.saving === null ? '–' : pctText(b.saving, 0)}</td>
                    <td className={b.violationMinutes > 0 ? 'as-bad' : 'as-good'}>{sig(b.violationMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Hint tone="muted" block>
            The saving is real money and so are the violation minutes: a fleet sized for the peak never drops a request in this model, and one that follows the load does, a little, when the load moves
            faster than the warm-up. Scaling to zero between requests is named here, and the cold-start cost it brings is the <Link to="/lesson/serverless-cold-starts">serverless cold starts</Link> lesson.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>four runs of two days under the chosen policy; only the noisy traffic reads the seed</Provenance>
          <Provenance kind="illustrative">{priceNote} is made up, and instances are billed by the minute while warming</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { FleetPlot } from './FleetPlot';
import { cheapestClean, policyCaption } from './frames';
import {
  CONTROLLER_DEFAULT, FOCUS_MINUTE, POLICIES, POLICY_NAME, PRESETS, PRESET_NAME, SCENE_DEFAULT, WARMUP_RANGE, policyTable, runFleet, type Policy, type Preset,
} from './model';

const POLICY_OPTIONS = POLICIES.map((p) => ({ value: p, label: POLICY_NAME[p] }));
const PRESET_OPTIONS = PRESETS.map((p) => ({ value: p, label: PRESET_NAME[p] }));

export function PolicyScene({ picker }: { picker: ReactNode }) {
  const [policy, setPolicy] = useState<Policy>('predictive');
  const [preset, setPreset] = useState<Preset>('daily');
  const [warmupMin, setWarmupMin] = useState(CONTROLLER_DEFAULT.warmupMin);
  const [seed, setSeed] = useState(SCENE_DEFAULT.seed);
  const base = useMemo(() => ({ ...CONTROLLER_DEFAULT, warmupMin }), [warmupMin]);
  const table = useMemo(() => policyTable(base, seed), [base, seed]);
  const run = useMemo(() => runFleet(preset, { ...base, policy }, seed), [base, policy, preset, seed]);

  useIntroCaption(policyCaption(table, policy, preset), [table, policy, preset]);

  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'cheapest policy with no violations' },
            { color: 'var(--bad)', label: 'a cell with violations' },
            { color: 'var(--hi)', label: 'the run drawn below' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Policy" value={policy} onChange={setPolicy} options={POLICY_OPTIONS} />
          <Segmented label="Traffic" value={preset} onChange={setPreset} options={PRESET_OPTIONS} />
        </>,
        <>
          <Slider label="Warm-up" value={warmupMin} {...WARMUP_RANGE} format={(v) => `${v} min`} onChange={setWarmupMin} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="as-stage stage-pad">
        <Box className="as-table-box">
          <SectionTitle hint="violation minutes / instance-minutes on day 2; each cell is its own run">Three policies against four traffic shapes</SectionTitle>
          <div className="as-table-wrap">
            <table className="data-table as-table">
              <thead>
                <tr>
                  <th />
                  {PRESETS.map((p) => <th key={p} scope="col" className="keep-case">{PRESET_NAME[p]}</th>)}
                </tr>
              </thead>
              <tbody>
                {POLICIES.map((pol) => (
                  <tr key={pol}>
                    <th scope="row">{POLICY_NAME[pol]}</th>
                    {PRESETS.map((pre) => {
                      const cell = table[pol][pre];
                      const cls = `${cell.violationMinutes > 0 ? 'as-bad' : cheapestClean(table, pol, pre) ? 'as-good' : ''} ${pol === policy && pre === preset ? 'as-picked' : ''}`;
                      return (
                        <td key={pre} className={cls}>
                          <b>{cell.violationMinutes}</b> / {sig(cell.instanceMinutes)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <FleetPlot run={run} now={FOCUS_MINUTE[preset]} />
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>twelve runs of two days; only the noisy traffic reads the seed</Provenance>
          <Provenance kind="illustrative">every setting except the warm-up is the first scene&apos;s default: target {CONTROLLER_DEFAULT.targetPct}%, cooldowns {CONTROLLER_DEFAULT.cooldownOut} and {CONTROLLER_DEFAULT.cooldownIn} minutes</Provenance>
        </ProvenanceRow>
        <Hint tone="muted" className="as-note">
          Scheduled raises the minimum between 08:00 and 20:00 each day, with the reactive loop underneath. Predictive provisions ahead for the busiest minute of yesterday&apos;s load in the next few
          minutes, and has no yesterday on day 1, so it only runs from day 2. The flash spike happens on day 2 only, so yesterday cannot know about it. Vertical scaling (a bigger instance,
          usually with a restart) is named here and not modelled.
        </Hint>
      </div>
    </StageFrame>
  );
}

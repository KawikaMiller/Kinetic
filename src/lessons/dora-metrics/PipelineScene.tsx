import { useMemo, useState, type ReactNode } from 'react';
import { MetricMeter } from '../../components/MetricMeter';
import type { MeterBand } from '../../components/meterBands';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { hours, minutes, perWeek, pipelineCaption } from './frames';
import {
  AUTOMATION_RANGE, BANDS, BATCH_RANGE, CADENCE_RANGE, CHANGES_PER_DAY_RANGE, GAMING_NAME, GAMING_OPTIONS, PIPELINE_DEFAULT, SCENE1_SEED, WEEKS, reportedMetrics, runDelivery,
  type Gaming, type Pipeline, type ReleaseMode,
} from './model';
import { pctText } from '../../core/format';
import { SeedField } from '../../components/SeedField';

const MODE_OPTIONS: { value: ReleaseMode; label: string }[] = [{ value: 'batch', label: 'a batch of changes' }, { value: 'train', label: 'a release train' }];
const GAMING_CHOICES = GAMING_OPTIONS.map((g) => ({ value: g, label: GAMING_NAME[g] }));

const bandsAscendingGood = (good: number, between: number, max: number): MeterBand[] => [
  { upTo: good, tone: 'ok', label: 'good (illustrative)' },
  { upTo: between, tone: 'hi', label: 'between' },
  { upTo: max, tone: 'bad', label: 'poor' },
];

export function PipelineScene({ picker }: { picker: ReactNode }) {
  const [p, setP] = useState<Pipeline>(PIPELINE_DEFAULT);
  const [gaming, setGaming] = useState<Gaming>('none');
  const [seed, setSeed] = useState(SCENE1_SEED);
  const set = (patch: Partial<Pipeline>) => setP((q) => ({ ...q, ...patch }));
  const real = useMemo(() => runDelivery(p, seed), [p, seed]);
  const shown = reportedMetrics(real, gaming);

  useIntroCaption(pipelineCaption(p, real, shown, gaming), [p, seed, gaming]);

  const moved: { name: string; reported: string; real: string; gamed: boolean }[] = [
    { name: 'Deployment frequency', reported: perWeek(shown.deploymentsPerWeek), real: perWeek(real.deploymentsPerWeek), gamed: shown.deploymentsPerWeek !== real.deploymentsPerWeek },
    { name: 'Lead time (median)', reported: shown.leadHoursMedian === null ? '–' : hours(shown.leadHoursMedian), real: real.leadHoursMedian === null ? '–' : hours(real.leadHoursMedian), gamed: false },
    { name: 'Change failure rate', reported: shown.failureRate === null ? '–' : pctText(shown.failureRate, 0), real: real.failureRate === null ? '–' : pctText(real.failureRate, 0), gamed: shown.failureRate !== real.failureRate },
    { name: 'Time to restore (median)', reported: shown.restoreMedianMin === null ? '–' : minutes(shown.restoreMedianMin), real: real.restoreMedianMin === null ? '–' : minutes(real.restoreMedianMin), gamed: false },
  ];

  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'good (illustrative band)' },
            { color: 'var(--hi)', label: 'between' },
            { color: 'var(--bad)', label: 'poor' },
            { color: 'var(--orange)', label: 'a gamed number' },
            { color: 'var(--info)', label: 'the real measure' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Release by" value={p.mode} onChange={(mode) => set({ mode })} options={MODE_OPTIONS} />
          {p.mode === 'batch' ? (
            <Slider label="Batch size" value={p.batch} {...BATCH_RANGE} format={(v) => `${v} ${v === 1 ? 'change' : 'changes'}`} onChange={(batch) => set({ batch })} />
          ) : (
            <Slider label="Release every" value={p.cadenceDays} {...CADENCE_RANGE} format={(v) => `${v} working ${v === 1 ? 'day' : 'days'}`} onChange={(cadenceDays) => set({ cadenceDays })} />
          )}
          <Slider label="Merged changes a day" value={p.changesPerDay} {...CHANGES_PER_DAY_RANGE} onChange={(changesPerDay) => set({ changesPerDay })} />
        </>,
        <>
          <Toggle label="Manual QA gate" value={p.manualQa} onChange={(manualQa) => set({ manualQa })} off="none" on="+ 2 days" />
          <Slider label="Test automation" value={p.automation} {...AUTOMATION_RANGE} format={(v) => pctText(v, 0)} onChange={(automation) => set({ automation })} />
          <Toggle label="On failure" value={p.rollbackFirst} onChange={(rollbackFirst) => set({ rollbackFirst })} off="find the culprit" on="roll back first" />
        </>,
        <>
          <Segmented label="Team games the metric" value={gaming} onChange={setGaming} options={GAMING_CHOICES} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="dm-stage stage-pad">
        <div className="dm-claims">
          <ClaimLabel kind="research">the four metrics come from the DORA research programme (Forsgren, Humble and Kim, Accelerate, 2018)</ClaimLabel>
        </div>
        <div className="dm-meters">
          <MetricMeter
            label="Deployment frequency"
            value={shown.deploymentsPerWeek}
            max={BANDS.deploymentsPerWeek.max}
            format={perWeek}
            bands={[
              { upTo: BANDS.deploymentsPerWeek.poorBelow, tone: 'bad', label: 'poor' },
              { upTo: BANDS.deploymentsPerWeek.goodFrom, tone: 'hi', label: 'between' },
              { upTo: BANDS.deploymentsPerWeek.max, tone: 'ok', label: 'good (illustrative)' },
            ]}
            header={<span className="dm-def">releases to production a week</span>}
          />
          <MetricMeter
            label="Lead time for changes"
            value={shown.leadHoursMedian}
            max={BANDS.leadHours.max}
            format={hours}
            bands={bandsAscendingGood(BANDS.leadHours.goodUpTo, BANDS.leadHours.betweenUpTo, BANDS.leadHours.max)}
            header={<span className="dm-def">median working hours from merge to live</span>}
          />
          <MetricMeter
            label="Change failure rate"
            value={shown.failureRate}
            max={BANDS.failureRate.max}
            format={(v) => pctText(v, 0)}
            bands={bandsAscendingGood(BANDS.failureRate.goodUpTo, BANDS.failureRate.betweenUpTo, BANDS.failureRate.max)}
            header={<span className="dm-def">share of releases that fail</span>}
          />
          <MetricMeter
            label="Time to restore"
            value={shown.restoreMedianMin}
            max={BANDS.restoreMin.max}
            format={minutes}
            bands={bandsAscendingGood(BANDS.restoreMin.goodUpTo, BANDS.restoreMin.betweenUpTo, BANDS.restoreMin.max)}
            header={<span className="dm-def">median minutes from failure to service restored</span>}
          />
        </div>
        {gaming !== 'none' && (
          <Box className="dm-moved">
            <SectionTitle hint="what the gamed team reports, and what is real">What moved and what did not</SectionTitle>
            <table className="data-table dm-table">
              <thead>
                <tr><th>metric</th><th>reported</th><th>real</th></tr>
              </thead>
              <tbody>
                {moved.map((m) => (
                  <tr key={m.name}>
                    <th scope="row">{m.name}</th>
                    <td className={m.gamed ? 'dm-gamed' : ''}>{m.reported}</td>
                    <td className={m.gamed ? 'dm-real' : ''}>{m.real}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}
        <Hint tone="muted" className="dm-banner">
          Shrinking the batch moves all four numbers the good way in this model by construction: that is the model&apos;s assumption, matching what DORA&apos;s survey research reports, and the
          simulation does not prove it. These measure a team&apos;s own delivery over time, not people, and are not for comparing teams.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>{WEEKS} weeks of working days, a day a tick; arrivals are Poisson, each change is defective with a made-up chance</Provenance>
          <Provenance kind="illustrative">a 3% defect rate, up to 60% less with automation, a 2 day QA gate, 15 + 20 per step + 15 minutes to restore, and every band: all made up, never DORA&apos;s own bands</Provenance>
          <Provenance kind="from-memory">definitions have been revised since the book (recovery time renamed, a reliability measure added) and the bands change from year to year: check dora.dev for the current ones</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { MetricMeter } from '../../components/MetricMeter';
import type { MeterBand } from '../../components/meterBands';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { SeedField } from '../distributions/SeedField';
import { sig } from '../distributions/fmt';
import { FleetPlot, InstanceLanes } from './FleetPlot';
import { clockText, minuteCaption } from './frames';
import {
  CONTROLLER_DEFAULT, COOLDOWN_RANGE, COUNT_RANGE, FOCUS_MINUTE, INSTANCE_RPS, LATENCY_CAP, MAX_INSTANCES, MINUTES_PER_DAY, PRESETS, PRESET_NAME, RUN_MINUTES, SCENE_DEFAULT,
  TARGET_RANGE, VIOLATION_PCT, WARMUP_RANGE, runFleet, type Controller, type Preset,
} from './model';

const PRESET_OPTIONS = PRESETS.map((p) => ({ value: p, label: PRESET_NAME[p] }));
const METER_MAX = 300;

/** Within the target, above it but not yet a violation, and a violation: the middle band disappears when the target is itself at or past the violation line. */
function utilisationBands(targetPct: number): MeterBand[] {
  const tick = { label: `target ${targetPct}%`, tone: 'dim' as const };
  if (targetPct >= VIOLATION_PCT) {
    return [{ upTo: VIOLATION_PCT, tone: 'ok', label: 'within the target', tick }, { upTo: METER_MAX, tone: 'bad', label: 'violation' }];
  }
  return [
    { upTo: targetPct, tone: 'ok', label: 'within the target', tick },
    { upTo: VIOLATION_PCT, tone: 'orange', label: 'above the target' },
    { upTo: METER_MAX, tone: 'bad', label: 'violation' },
  ];
}

export function ReactiveScene({ picker }: { picker: ReactNode }) {
  const [preset, setPreset] = useState<Preset>(SCENE_DEFAULT.preset);
  const [controller, setController] = useState<Controller>(CONTROLLER_DEFAULT);
  const [seed, setSeed] = useState(SCENE_DEFAULT.seed);
  const [picked, setPicked] = useState<number | null>(null);
  const set = (patch: Partial<Controller>) => setController((c) => ({ ...c, ...patch }));
  const now = picked ?? FOCUS_MINUTE[preset];
  const choosePreset = (p: Preset) => {
    setPreset(p);
    setPicked(null);
  };

  const run = useMemo(() => runFleet(preset, controller, seed), [preset, controller, seed]);
  const row = run.rows[now];
  const fixedFleet = controller.min === controller.max;

  useIntroCaption(minuteCaption(row, controller, run), [run, now]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Violation minutes (day 2)" value={run.summary.violationMinutes} color={run.summary.violationMinutes > 0 ? 'var(--bad)' : 'var(--ok)'} sub={['load above 90% of ready capacity, or dropped']} />
          <Stat label="Dropped requests (day 2)" value={sig(run.summary.dropped)} color="var(--bad)" sub={['load above ready capacity']} />
          <Stat label="Instance-minutes (day 2)" value={sig(run.summary.instanceMinutes)} sub={['ready plus warming, both are paid for']} />
          <Stat label="Flapping (day 2)" value={run.summary.flaps} sub={['reversals in the direction of fleet changes']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'offered load', shape: 'line' },
            { color: 'var(--ok)', label: 'ready capacity', shape: 'line' },
            { color: 'var(--violet)', label: 'ready + warming (paid for)', shape: 'line' },
            { color: 'var(--bad)', label: 'dropped load' },
            { color: 'var(--hi)', label: 'the minute shown', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Traffic" value={preset} onChange={choosePreset} options={PRESET_OPTIONS} />
          <Toggle label="Warming instances" value={controller.warmingCounts} onChange={(warmingCounts) => set({ warmingCounts })} off="ignored in the formula" on="count as current" />
        </>,
        <>
          <Slider label="Target utilisation" value={controller.targetPct} {...TARGET_RANGE} format={(v) => `${v}%`} onChange={(targetPct) => set({ targetPct })} />
          <Slider label="Warm-up" value={controller.warmupMin} {...WARMUP_RANGE} format={(v) => `${v} min`} onChange={(warmupMin) => set({ warmupMin })} />
          <Slider label="Scale-out cooldown" value={controller.cooldownOut} {...COOLDOWN_RANGE} format={(v) => `${v} min`} onChange={(cooldownOut) => set({ cooldownOut })} />
          <Slider label="Scale-in cooldown" value={controller.cooldownIn} {...COOLDOWN_RANGE} format={(v) => `${v} min`} onChange={(cooldownIn) => set({ cooldownIn })} />
        </>,
        <>
          <Slider label="Minimum" value={controller.min} min={COUNT_RANGE.min} max={controller.max} onChange={(min) => set({ min })} />
          <Slider label="Maximum" value={controller.max} min={controller.min} max={COUNT_RANGE.max} onChange={(max) => set({ max })} />
          <Slider label="Minute shown" value={now} min={MINUTES_PER_DAY} max={RUN_MINUTES - 1} format={(v) => clockText(v).replace(' on day 2', '')} onChange={setPicked} />
          {preset === 'noisy' && <SeedField seed={seed} onSeed={setSeed} />}
        </>,
      ]}
    >
      <div className="as-stage stage-pad">
        <FleetPlot run={run} now={now} onNow={setPicked} />
        <div className="as-meters">
          <MetricMeter
            label={`Utilisation at ${clockText(now).replace(' on day 2', '')}`}
            value={row.ready === 0 ? null : (100 * row.load) / (row.ready * INSTANCE_RPS)}
            max={METER_MAX}
            format={(v) => `${sig(v, 3)}%`}
            bands={utilisationBands(controller.targetPct)}
          />
          <Stat label="Latency proxy" value={`${sig(row.proxy, 3)}×`} sub={[`1 / (1 − ρ) service times, capped at ${LATENCY_CAP}`, 'a proxy, not a measurement']} color={row.violation ? 'var(--bad)' : undefined} />
        </div>
        <InstanceLanes run={run} now={now} />
        {fixedFleet && <Hint tone="muted" className="as-note">Minimum and maximum are equal: this is a fixed fleet of {controller.min}, not an autoscaler.</Hint>}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={preset === 'noisy' ? seed : undefined}>two days at one-minute ticks{preset === 'noisy' ? '' : '; this traffic has no randomness'}; scores count day 2</Provenance>
          <Provenance kind="illustrative">{INSTANCE_RPS} requests/s per instance, the traffic shapes and the limits (up to {MAX_INSTANCES}) are made up</Provenance>
          <Provenance kind="from-memory">target tracking is desired = ⌈current × metric ÷ target⌉, as Kubernetes&apos; horizontal autoscaler documents it; verify against its docs. Real autoscalers add a tolerance band and stabilisation windows that this model leaves out</Provenance>
        </ProvenanceRow>
        <Hint tone="muted" className="as-note">
          A launch decided at the end of a minute serves from the minute after, plus the warm-up. Load above ready capacity is dropped. The utilisation the controller reads is load as a percent of ready
          capacity and can pass 100%. The latency number is a proxy.
        </Hint>
      </div>
    </StageFrame>
  );
}

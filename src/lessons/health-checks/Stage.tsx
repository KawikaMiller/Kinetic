import { useMemo, useState } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import type { Option } from '../../components/options';
import { usePlayer } from '../../core/usePlayer';
import { healthFrames } from './frames';
import { CHECKS, HORIZON, PODS, SCENARIOS, scenarioById, simulate, STARTUP_DEFAULT, totalsAt, type CheckKind, type Config, type ProbeConfig, type ProbeKind, type ScenarioId } from './model';
import { DbCard, PodCards, ServiceLine } from './PodCards';
import { CHECK_LABEL, inRotation, PROBE_LABEL, timelineBars, timelineLanes } from './view';
import './styles.css';

const STEP_MS = 330;
const TIMELINE_MIN_W = 480;
const MAX_PERIOD = 10;
const MAX_THRESHOLD = { startup: 20, liveness: 6, readiness: 6 } as const;
const CHECK_OPTIONS: Option<CheckKind>[] = CHECKS.map((c) => ({ value: c, label: CHECK_LABEL[c] }));
const TIMELINE_LABEL_W = 110;

const copy = (c: Config): Config => JSON.parse(JSON.stringify(c)) as Config;

/** The knobs of one probe: what it checks, how often, how many failures in a row. */
function ProbeControls({ kind, cfg, onChange }: { kind: ProbeKind; cfg: ProbeConfig; onChange: (patch: Partial<ProbeConfig>) => void }) {
  const name = PROBE_LABEL[kind];
  return (
    <>
      {kind === 'startup' && <Toggle label="Startup probe" value={cfg.enabled} onChange={(enabled) => onChange(enabled ? { ...STARTUP_DEFAULT } : { enabled: false })} off="Off" on="On" />}
      {cfg.enabled && (
        <>
          <Segmented label={kind === 'startup' ? 'checks' : `${name} checks`} value={cfg.check} onChange={(check) => onChange({ check })} options={CHECK_OPTIONS} />
          <Slider label="period" value={cfg.period} min={1} max={MAX_PERIOD} onChange={(period) => onChange({ period })} format={(v) => `${v} s`} />
          <Slider label="failures" value={cfg.threshold} min={1} max={MAX_THRESHOLD[kind]} onChange={(threshold) => onChange({ threshold })} />
        </>
      )}
    </>
  );
}

export function Stage() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('slow-boot');
  const scenario = scenarioById(scenarioId);
  const [config, setConfig] = useState<Config>(() => copy(scenario.initial));
  const run = useMemo(() => simulate(config, scenario), [config, scenario]);
  const frames = useMemo(() => healthFrames(run), [run]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { shown } = player.frame;
  const totals = totalsAt(run, shown);

  const pick = (id: ScenarioId) => {
    setScenarioId(id);
    setConfig(copy(scenarioById(id).initial));
  };
  const patch = (kind: ProbeKind) => (p: Partial<ProbeConfig>) => setConfig((c) => ({ ...c, [kind]: { ...c[kind], ...p } }));

  return (
    <StageFrame
      player={player}
      height={640}
      stats={
        <Stats>
          <Stat label="In rotation" value={`${inRotation(run, shown)} of ${PODS}`} />
          <Stat label="Restarts" value={totals.restarts} color={totals.restarts > 0 ? 'var(--orange)' : undefined} />
          <Stat label="Errors served" value={totals.errors} color={totals.errors > 0 ? 'var(--bad)' : undefined} />
          <Stat label="Slow served" value={totals.slow} color={totals.slow > 0 ? 'var(--hi)' : undefined} />
          <Stat label="DB attempts" value={totals.dbAttempts} color="var(--hi)" />
          <Stat label="Rotation changes" value={totals.rotationChanges} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'probe passed' },
            { color: 'var(--bad)', label: 'probe failed' },
            { color: 'var(--dim)', label: 'not run yet' },
            { color: 'var(--orange)', label: 'restart' },
            { color: 'var(--info)', label: 'in rotation' },
            { color: 'var(--hi)', label: 'DB connection attempts' },
          ]}
        />
      }
      controls={[
        <ControlGroup key="scenario" label="Scenario" inline>
          {SCENARIOS.map((s) => (
            <ChipButton key={s.id} tone="info" on={scenarioId === s.id} onClick={() => pick(s.id)}>
              {s.label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <ProbeControls key="startup" kind="startup" cfg={config.startup} onChange={patch('startup')} />,
        <>
          <span className="hc-row-label">Liveness</span>
          <ProbeControls kind="liveness" cfg={config.liveness} onChange={patch('liveness')} />
        </>,
        <>
          <span className="hc-row-label">Readiness</span>
          <ProbeControls kind="readiness" cfg={config.readiness} onChange={patch('readiness')} />
        </>,
      ]}
    >
      <div className="hc stage-pad">
        <ServiceLine run={run} shown={shown} />
        <PodCards run={run} config={config} shown={shown} />
        <DbCard run={run} shown={shown} />
        <WideRegion minWidth={TIMELINE_MIN_W} label="Probe timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={timelineLanes(config, PODS)}
            bars={timelineBars(run, shown)}
            domain={[0, HORIZON]}
            now={shown}
            axis
            unit=" s"
            size="sm"
            labelWidth={TIMELINE_LABEL_W}
            ariaLabel={`Probe results and rotation over ${shown} of ${HORIZON} seconds`}
          />
        </WideRegion>
        <Hint block>
          Simulated pods and probes; timings are compressed (a real kubelet backs off between restarts, up to five minutes, which is what CrashLoopBackOff means). A probe that times out counts
          as a failure, and every probe's first run is when its container starts. The failures slider is how many failures in a row make a probe give up.
        </Hint>
      </div>
    </StageFrame>
  );
}

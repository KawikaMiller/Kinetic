import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { barsAt } from '../../core/gantt';
import { usePlayer } from '../../core/usePlayer';
import { barsOf, lanesOf, markersOf } from './bars';
import { PROTOCOL_LABEL, schedFrames, type SchedFrame } from './frames';
import { NAMES, openingOf, type Variant } from './openings';
import { BROKEN_SEED, DEFAULT_SCENARIO, PROTOCOLS, RANGES, scenarioFromSeed, schedule, verdictOf, type Protocol, type Scenario } from './sched';

const PROTOCOL_OPTIONS = PROTOCOLS.map((p) => ({ value: p, label: PROTOCOL_LABEL[p] }));
const ticks = (n: number) => `${n} ${n === 1 ? 'tick' : 'ticks'}`;

export function SchedScene({ variant, picker }: { variant: Variant; picker: ReactNode }) {
  const pathfinder = variant === 'pathfinder';
  const [open] = useState(() => openingOf(variant));
  const [scenario, setScenario] = useState<Scenario>(open.scenario);
  const [protocol, setProtocol] = useState<Protocol>(open.protocol);
  const [fromSeed, setFromSeed] = useState<number | null>(open.fromSeed);
  const [seed, setSeed] = useState(BROKEN_SEED);
  const [watchdog, setWatchdog] = useState(open.watchdog);
  const names = NAMES[variant];

  const sch = useMemo(() => schedule(scenario, { protocol, watchdog: pathfinder ? watchdog : null }), [scenario, protocol, watchdog, pathfinder]);
  const verdict = useMemo(() => verdictOf(sch), [sch]);
  const frames = useMemo(() => schedFrames(sch, variant, !pathfinder), [sch, variant, pathfinder]);
  const player = usePlayer<SchedFrame>(frames, { interval: 380, autoplayOnChange: false });
  const now = player.frame.now;
  const bars = useMemo(() => barsOf(sch, variant), [sch, variant]);
  const lanes = useMemo(() => lanesOf(variant), [variant]);
  const markers = useMemo(() => markersOf(sch, !pathfinder), [sch, pathfinder]);
  const domainEnd = Math.max(sch.ticks.length, pathfinder ? 0 : scenario.deadline, 1);

  const edit = (patch: Partial<Scenario>) => {
    setScenario((cur) => ({ ...cur, ...patch }));
    setFromSeed(null);
  };
  const loadSeed = (next: number) => {
    setSeed(next);
    setScenario(scenarioFromSeed(next));
    setFromSeed(next);
  };

  const blockingSub =
    verdict.blocking === null
      ? ['H never finished']
      : [`from its arrival to its finish, not running`, verdict.blocking <= scenario.csL ? `within L's critical section (${ticks(scenario.csL)})` : `longer than L's critical section (${ticks(scenario.csL)})`];
  const stats = pathfinder ? (
    <Stats>
      <Stat label="System resets" value={verdict.resetAt === null ? 'none' : `1 at tick ${verdict.resetAt}`} color={verdict.resetAt === null ? 'var(--ok)' : 'var(--bad)'} sub={[`watchdog: ${names.H} unable to run for more than ${ticks(watchdog)}`]} />
      <Stat label={`${names.H}: ticks waiting`} value={verdict.blocking ?? sch.ticks.filter((r) => r.status.H === 'blocked' || r.status.H === 'ready').length} sub={['after its arrival, not running']} />
      <Stat label="Mutex option" value={PROTOCOL_LABEL[protocol]} sub={[verdict.window > 0 ? `${ticks(verdict.window)} of waiting while a task outside the lock ran` : 'no waiting while an unrelated task ran']} />
    </Stats>
  ) : (
    <Stats>
      <Stat label="H's blocking time" value={verdict.blocking ?? '–'} color="var(--orange)" sub={blockingSub} />
      <Stat
        label="H finishes"
        value={verdict.finishH ?? '–'}
        color={verdict.met ? 'var(--ok)' : 'var(--bad)'}
        sub={[verdict.slack === null ? 'never' : verdict.slack >= 0 ? `deadline ${scenario.deadline}: met with ${ticks(verdict.slack)} to spare` : `deadline ${scenario.deadline}: missed by ${ticks(-verdict.slack)}`]}
      />
      <Stat label="Inversion window" value={ticks(verdict.window)} color={verdict.window > 0 ? 'var(--bad)' : undefined} sub={[verdict.noInversion ? 'no inversion in this scenario' : 'H waits while a task outside the lock runs']} />
    </Stats>
  );

  return (
    <StageFrame
      player={player}
      height={440}
      stats={stats}
      legend={
        <Legend
          items={[
            { color: 'var(--pink)', label: `${names.H}` },
            { color: 'var(--amber)', label: `${names.M}` },
            { color: 'var(--sky)', label: `${names.L}` },
            { color: 'var(--orange)', label: `${names.H} waiting (dashed: blocked, hatched: held back)` },
            { color: 'var(--dim)', label: `${names.M} or ${names.L} ready but not running (hatched)` },
            { color: 'var(--violet)', label: 'holds the lock (ring)' },
            { color: 'var(--info)', label: 'raised priority (diamond)' },
            { color: 'var(--bad)', label: 'inversion window, missed deadline or reset' },
            ...(pathfinder ? [] : [{ color: 'var(--ok)', label: 'deadline met' }]),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {pathfinder ? (
            <Toggle label="Mutex option" value={protocol === 'inheritance'} onChange={(on) => setProtocol(on ? 'inheritance' : 'none')} off="off" on="priority inheritance" />
          ) : (
            <Segmented label="Protocol" value={protocol} onChange={setProtocol} options={PROTOCOL_OPTIONS} />
          )}
        </>,
        <>
          <Slider label={`${names.L}'s critical section`} value={scenario.csL} {...RANGES.csL} format={ticks} onChange={(csL) => edit({ csL })} />
          <Slider label={`${names.H} arrives`} value={scenario.arrivalH} {...RANGES.arrivalH} format={(v) => `tick ${v}`} onChange={(arrivalH) => edit({ arrivalH })} />
          <Slider label={`${names.M} arrives`} value={scenario.arrivalM} {...RANGES.arrivalM} format={(v) => `tick ${v}`} onChange={(arrivalM) => edit({ arrivalM })} />
          <Slider label={`${names.M} computes`} value={scenario.lenM} {...RANGES.lenM} format={ticks} onChange={(lenM) => edit({ lenM })} />
          {pathfinder ? (
            <Slider label="Watchdog threshold" value={watchdog} {...RANGES.watchdog} format={ticks} onChange={setWatchdog} />
          ) : (
            <Slider label="H's deadline" value={scenario.deadline} {...RANGES.deadline} format={(v) => `tick ${v}`} onChange={(deadline) => edit({ deadline })} />
          )}
        </>,
        <>
          <ChipButton tone="info" on={scenario.arrivalH === 0} onClick={() => edit({ arrivalH: 0 })}>{names.H} arrives first (no inversion)</ChipButton>
          {!pathfinder && (
            <>
              <ChipButton tone="info" on={fromSeed === BROKEN_SEED} onClick={() => loadSeed(BROKEN_SEED)}>pinned broken seed ({BROKEN_SEED})</ChipButton>
              <SeedField seed={seed} onSeed={loadSeed} label="Scenario seed" />
            </>
          )}
          <ChipButton tone="info" onClick={() => { setScenario({ ...DEFAULT_SCENARIO }); setFromSeed(null); }}>default scenario</ChipButton>
        </>,
      ]}
    >
      <div className="pi-stage stage-pad">
        <div className="pi-timeline">
          <WideRegion minWidth={480} label="Timeline of the three tasks: scroll sideways to see all of it">
            <GanttLanes
              lanes={lanes}
              bars={barsAt(bars, now)}
              domain={[0, domainEnd]}
              now={now}
              markers={markers}
              unit=" t"
              axis
              size="md"
              labelWidth={pathfinder ? 150 : 110}
              labelMinPx={26}
              ariaLabel={`Which task runs in each tick, under ${PROTOCOL_LABEL[protocol]}`}
            />
          </WideRegion>
        </div>
        {verdict.noInversion && <Hint tone="muted" block>No inversion in this scenario: {names.H} never had to wait for R.</Hint>}
        <ProvenanceRow>
          <Provenance kind="toy">a fixed-priority preemptive scheduler on one core with abstract ticks (not milliseconds); locking takes no time, and a tie goes to the task that ran last</Provenance>
          {fromSeed !== null && <Provenance kind="simulated" seed={fromSeed}>a scenario drawn from the seed; the schedule itself is deterministic</Provenance>}
          {pathfinder && (
            <Provenance kind="from-memory">
              Mars Pathfinder, 1997, simplified: a high-priority bus-management task, a medium-priority communications task and a low-priority meteorological task shared a mutex, a watchdog reset the system, and enabling priority inheritance on that mutex was the fix; verify against Glenn Reeves&apos; account and the VxWorks documentation of its inversion-safe mutex option before repeating any detail
            </Provenance>
          )}
          <ClaimLabel kind="practice">priority inheritance does not prevent deadlock (two locks taken in opposite order still deadlock), and with several locks blocking can chain</ClaimLabel>
          <ClaimLabel kind="standard">POSIX exposes the two protocols as mutex attributes PTHREAD_PRIO_INHERIT and PTHREAD_PRIO_PROTECT; Linux has futex-based priority-inheritance mutexes (from memory: verify against the pthreads and kernel documentation)</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar, type GanttLane } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { barsAt } from '../../core/gantt';
import { bytes, ms, plural } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { CompareTable } from './CompareTable';
import { runFrames, switchRule, type RunFrame } from './frames';
import {
  CPU_MS, FAULT_REQUEST, HOG_MS, IO_MS, QUANTUM_MS, RANGES, RUNTIMES, SHOWN_REQUESTS, STACK_MB, outcomeOf, refusal, simulate, withoutFault, type Run, type Runtime,
} from './model';
import { openingFor, type Scene } from './openings';

const RUNTIME_OPTIONS = RUNTIMES.map((r) => ({ value: r.id, label: r.label }));
const HOLDER: Record<Runtime, string> = { threads: 'threads', events: 'event loop', actors: 'actors', csp: 'workers' };

/** The bars of the first requests, from the schedule: CPU work, waiting for a turn, I/O blocked, and the marks. */
function barsOf(run: Run, baseline: Run): { lanes: GanttLane[]; bars: GanttBar[] } {
  const shown = Math.min(SHOWN_REQUESTS, run.params.requests);
  const lanes: GanttLane[] = Array.from({ length: shown }, (_, i) => ({ id: `r${i + 1}`, label: `request ${i + 1}` }));
  const bars: GanttBar[] = run.segs
    .filter((s) => s.req <= shown)
    .map((s, i) => ({
      id: `s${i}`,
      lane: `r${s.req}`,
      start: s.start,
      end: s.end,
      tone: s.kind === 'cpu' ? (s.hog ? 'bad' : 'info') : s.kind === 'wait' ? 'orange' : 'dim',
      kind: s.kind === 'cpu' ? 'work' : s.kind === 'wait' ? 'wait' : 'blocked',
      minPx: s.kind === 'cpu' ? 2 : undefined,
      label: s.kind === 'cpu' ? (s.hog ? 'the slow handler' : 'CPU') : s.kind === 'wait' ? 'waiting for its turn' : 'waiting on I/O',
    }));
  for (const m of run.marks) {
    if (m.req > shown) continue;
    if (m.kind === 'finish') {
      const onTime = baseline.finish[m.req] === m.at;
      bars.push({ id: `m${m.req}f`, lane: `r${m.req}`, start: m.at, end: m.at, tone: onTime ? 'ok' : 'orange', label: onTime ? 'done' : 'done late' });
    } else bars.push({ id: `m${m.req}${m.kind}`, lane: `r${m.req}`, start: m.at, end: m.at, tone: m.kind === 'crash' ? 'bad' : 'ok', label: m.kind });
  }
  return { lanes, bars };
}

export function RunScene({ scene, picker, setScene }: { scene: Scene; picker: ReactNode; setScene: (s: Scene) => void }) {
  const [p, setP] = useState(() => openingFor(scene));
  const problem = refusal(p);
  const run = useMemo(() => (problem ? null : simulate(p)), [p, problem]);
  const baseline = useMemo(() => (problem ? null : simulate(withoutFault(p))), [p, problem]);
  const frames = useMemo<RunFrame[]>(() => (run && baseline ? runFrames(run, baseline) : [{ now: 0, say: problem }]), [run, baseline, problem]);
  const player = usePlayer<RunFrame>(frames, { interval: 320, autoplayOnChange: false });
  const now = player.frame.now;
  const timeline = useMemo(() => (run && baseline ? barsOf(run, baseline) : { lanes: [], bars: [] }), [run, baseline]);
  const outcome = outcomeOf(p.fault === 'crash' ? p : { ...p, net: false });
  const crash = p.fault === 'crash';

  const set = (patch: Partial<typeof p>) => setP((cur) => ({ ...cur, ...patch }));
  const holder = HOLDER[p.runtime];

  const stats = (
    <Stats>
      <Stat label="Wall time" value={run ? ms(run.makespan) : '–'} sub={[run ? 'until the last request resolved' : 'refused: nothing was run']} />
      <Stat
        label="Requests finished"
        value={run ? `${run.finished} of ${p.requests}` : '–'}
        color={run && run.failed > 0 ? 'var(--bad)' : undefined}
        sub={run ? [run.failed > 0 ? `${run.failed} failed` : 'none failed'] : undefined}
      />
      <Stat
        label="Peak concurrent"
        value={run ? run.peakConcurrent : '–'}
        sub={run ? [`${holder} holding an unfinished request at once`, `most cores busy: ${run.peakCores} of ${p.cores}`] : undefined}
      />
      <Stat
        label="Memory (illustrative)"
        value={run ? bytes(run.memoryMb * 1024 * 1024, { dp: 0 }) : '–'}
        sub={run ? [`${plural(run.osThreads, 'OS thread')} × ${STACK_MB} MB reserved each`] : undefined}
      />
      <Stat
        label="Bystander latency"
        value={run?.bystanderFinish != null ? ms(run.bystanderFinish) : '–'}
        color={run && baseline && run.bystanderFinish !== null && baseline.bystanderFinish !== null && run.bystanderFinish > baseline.bystanderFinish ? 'var(--orange)' : undefined}
        sub={
          run && baseline
            ? [`finish of the fastest request other than ${FAULT_REQUEST}`, baseline.bystanderFinish === null ? '' : `${ms(baseline.bystanderFinish)} with no fault`]
            : undefined
        }
      />
      <Stat label="Context switches (toy)" value={run ? run.switches : '–'} sub={[switchRule(p)]} />
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
            { color: 'var(--info)', label: 'CPU work' },
            { color: 'var(--dim)', label: 'waiting on I/O (dashed)' },
            { color: 'var(--orange)', label: 'delayed behind another (hatched)' },
            ...(p.fault === 'hog' ? [{ color: 'var(--bad)', label: 'the slow handler' }] : []),
            ...(crash ? [{ color: 'var(--bad)', label: 'crash' }, { color: 'var(--ok)', label: 'restart, or finished on time', shape: 'dot' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Runtime" value={p.runtime} onChange={(runtime) => set({ runtime })} options={RUNTIME_OPTIONS} />
          {crash && <Toggle label="Safety net" value={p.net} onChange={(net) => set({ net })} off="off (default)" on="on" />}
        </>,
        <>
          <Slider label="Requests R" value={p.requests} {...RANGES.requests} onChange={(requests) => set({ requests })} />
          <Slider label="Cores C" value={p.cores} {...RANGES.cores} onChange={(cores) => set({ cores })} />
          {p.runtime === 'threads' && (
            <Slider label="Pool size P" value={p.pool} {...RANGES.pool} format={(v) => (v >= p.requests ? `${v} (a thread each)` : String(v))} onChange={(pool) => set({ pool })} />
          )}
          {p.runtime === 'actors' && <Slider label="Actors A" value={p.actors} {...RANGES.actors} onChange={(actors) => set({ actors })} />}
          {p.runtime === 'csp' && (
            <>
              <Slider label="Workers W" value={p.workers} {...RANGES.workers} onChange={(workers) => set({ workers })} />
              <Slider label="Channel buffer K" value={p.buffer} {...RANGES.buffer} format={(v) => (v === 0 ? '0 (rendezvous)' : String(v))} onChange={(buffer) => set({ buffer })} />
            </>
          )}
        </>,
        <>
          {scene !== 'normal' && (
            <ChipButton tone="info" onClick={() => setScene('normal')}>
              100 URLs, 4 cores
            </ChipButton>
          )}
          {scene !== 'slow' && (
            <ChipButton tone="info" onClick={() => setScene('slow')}>
              one slow handler
            </ChipButton>
          )}
          {scene !== 'crash' && (
            <ChipButton tone="info" onClick={() => setScene('crash')}>
              one crash
            </ChipButton>
          )}
          {scene === 'slow' && (
            <ChipButton tone="info" on={p.runtime === 'events'} onClick={() => set({ runtime: 'events' })}>
              blocking call inside the event loop
            </ChipButton>
          )}
        </>,
      ]}
    >
      <div className="cm-stage stage-pad">
        {problem ? (
          <Hint tone="muted" block>{problem}</Hint>
        ) : (
          <div className="cm-timeline">
            <WideRegion minWidth={520} label="Timeline of the first requests: scroll sideways to see all of it">
              <GanttLanes
                lanes={timeline.lanes}
                bars={barsAt(timeline.bars, now)}
                domain={[0, run?.makespan ?? 1]}
                now={now}
                unit=" ms"
                axis
                size="sm"
                labelWidth={84}
                labelMinPx={Number.POSITIVE_INFINITY}
                ariaLabel={`The first ${Math.min(SHOWN_REQUESTS, p.requests)} of ${p.requests} requests on the ${RUNTIMES.find((r) => r.id === p.runtime)?.label} runtime`}
              />
            </WideRegion>
            <Hint tone="muted" block>
              The timeline draws the first {Math.min(SHOWN_REQUESTS, p.requests)} of {p.requests} requests; the numbers count them all.
            </Hint>
          </div>
        )}
        {p.fault !== 'none' && (
          <Hint tone="muted" block>
            <b>In this setup:</b> {outcome.text}.
          </Hint>
        )}
        <CompareTable params={p} />
        <ProvenanceRow>
          <Provenance kind="simulated">a deterministic millisecond-by-millisecond schedule on {plural(p.cores, 'core')}: same settings, same run, no randomness</Provenance>
          <Provenance kind="illustrative">{CPU_MS} ms of CPU, a {IO_MS} ms I/O wait, a {HOG_MS} ms slow handler, {STACK_MB} MB of stack per thread and a {QUANTUM_MS} ms time slice are made-up round numbers (default stack sizes differ by OS and runtime: check yours)</Provenance>
          <Provenance kind="toy">context switches are counted by the rule printed under the number; real thread switches cost microseconds and depend on the OS</Provenance>
          <Provenance kind="from-memory">what each runtime does by default when a handler crashes (Java thread, Node callback, Erlang or Akka supervisor, Go goroutine); verify against the Java, Node, Go and Erlang/OTP documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

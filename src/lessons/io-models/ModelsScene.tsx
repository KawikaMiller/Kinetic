import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { modelsCaption, n, virtual } from './captions';
import {
  ACTIVE_STEPS, CONNECTION_STEPS, DEFAULT_ACTIVE_INDEX, DEFAULT_CONNECTIONS_INDEX, DEFAULT_MODEL, DEFAULT_SERVER_SEED, DEFAULT_WORK, ENTRY_NOTE, MODELS, MODEL_LABEL, MODEL_SHORT, ROUNDS, STACK_BYTES, SYSCALL_TICKS, ENTRY_TICKS, WAKE_TICKS,
  makeSchedule, overheadShare, runModel, type Model,
} from './serve';
import { INSTANT_KEY, TRACE_CONNECTIONS, echoTrace } from './trace';

const MODEL_OPTIONS = MODELS.map((m) => ({ value: m, label: MODEL_LABEL[m] }));
const GANTT_MIN_WIDTH = 900;

export function ModelsScene({ picker }: { picker: ReactNode }) {
  const [model, setModel] = useState<Model>(DEFAULT_MODEL);
  const [connIndex, setConnIndex] = useState(DEFAULT_CONNECTIONS_INDEX);
  const [activeIndex, setActiveIndex] = useState(DEFAULT_ACTIVE_INDEX);
  const [work, setWork] = useState(DEFAULT_WORK);
  const [seed, setSeed] = useState(DEFAULT_SERVER_SEED);
  const connections = CONNECTION_STEPS[connIndex];
  const activePct = ACTIVE_STEPS[activeIndex];
  const schedule = useMemo(() => makeSchedule(connections, activePct, seed), [connections, activePct, seed]);
  const all = useMemo(() => MODELS.map((m) => runModel(m, connections, schedule)), [connections, schedule]);
  const c = all[MODELS.indexOf(model)];
  const echo = useMemo(() => echoTrace(model, work), [model, work]);

  return (
    <StageFrame
      height={420}
      intro={modelsCaption(c, connections, activePct, work)}
      introKey={[c, connections, activePct, work]}
      stats={
        <Stats>
          <Stat label="System calls" value={n(c.syscalls)} sub={[`over ${ROUNDS} rounds`, c.setupSyscalls > 0 ? `plus ${n(c.setupSyscalls)} one-time epoll_ctl` : 'no registration step']} />
          <Stat label="fd entries handled" value={n(c.entries)} color="var(--info)" sub={ENTRY_NOTE[c.model]} />
          <Stat label="Wasted calls" value={n(c.wasted)} color={c.wasted > 0 ? 'var(--orange)' : undefined} sub="returned EAGAIN, no data" />
          <Stat label="Threads" value={n(c.threads)} color="var(--violet)" sub={`${virtual(c.stackBytes)} virtual stack`} />
          <Stat label="Requests served" value={n(c.served.length)} color="var(--ok)" sub={`${Math.round(overheadShare(c, work) * 100)}% of CPU ticks are overhead`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a worker on a ready fd', shape: 'square' },
            { color: 'var(--ok)', label: 'a call that returned data', shape: 'square' },
            { color: 'var(--info)', label: 'the kernel scanning or returning fds', shape: 'square' },
            { color: 'var(--orange)', label: 'a wasted call (EAGAIN)', shape: 'square' },
            { color: 'var(--dim)', label: 'a blocked thread (dashed) or an idle loop (hatched)', shape: 'square' },
            { color: 'var(--violet)', label: 'thread stacks', shape: 'square' },
            { color: 'var(--muted)', label: INSTANT_KEY, shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="I/O model" value={model} onChange={setModel} options={MODEL_OPTIONS} />
        </>,
        <>
          <Slider label="Connections" value={connIndex} min={0} max={CONNECTION_STEPS.length - 1} onChange={setConnIndex} format={(i) => n(CONNECTION_STEPS[i])} />
          <Slider label="Ready per round" value={activeIndex} min={0} max={ACTIVE_STEPS.length - 1} onChange={setActiveIndex} format={(i) => `${ACTIVE_STEPS[i]}%`} />
          <Slider label="Work per request" value={work} min={1} max={20} onChange={setWork} format={(v) => `${v} ticks`} />
          <SeedField key={seed} seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="iom-stage stage-pad">
        <Box>
          <SectionTitle hint="the same seeded schedule drives every row">Counted per model, {n(connections)} connections</SectionTitle>
          <div className="iom-table-wrap">
            <table className="data-table iom-table">
              <thead>
                <tr><th scope="col">Model</th><th scope="col">Calls</th><th scope="col">fd entries</th><th scope="col">Wasted</th><th scope="col">Threads</th><th scope="col">Served</th></tr>
              </thead>
              <tbody>
                {all.map((row) => (
                  <tr key={row.model} className={row.model === model ? 'is-on' : ''}>
                    <th scope="row">{MODEL_SHORT[row.model]}</th>
                    <td>{n(row.syscalls)}</td><td>{n(row.entries)}</td><td>{n(row.wasted)}</td><td>{n(row.threads)}</td><td>{n(row.served.length)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <Box>
          <SectionTitle hint={`always ${TRACE_CONNECTIONS} connections, however many the counters use`}>One round trip on the lanes: {MODEL_LABEL[model]}</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Lanes for three connections: scroll sideways to see all of it">
            <GanttLanes lanes={echo.lanes} bars={echo.bars} domain={[0, echo.end]} axis size="md" labelMinPx={46} ariaLabel={`${MODEL_LABEL[model]}, three connections`} />
          </WideRegion>
          <Hint tone="muted" block>
            A blocked thread costs {virtual(STACK_BYTES)} of address space, mostly not resident. An epoll or select loop handles the ready fds one after another on one thread; the thread-per-connection lanes run in parallel on several cores.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>simulated server and arrivals; real servers add parsing, TLS and scheduling</Provenance>
          <Provenance kind="illustrative">{SYSCALL_TICKS} ticks a call, {ENTRY_TICKS} an fd entry, {WAKE_TICKS} a thread wake-up: not measured</Provenance>
          <Provenance kind="from-memory">an 8 MiB default thread stack on Linux is address space, not memory in use: check `ulimit -s` and `man pthread_create`</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

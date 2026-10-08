import { useMemo, useState, type ReactNode } from 'react';
import { CallStackPanel } from '../../components/CallStackPanel';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { usePlayer } from '../../core/usePlayer';
import { combinatorCaption, fmtSettled, machineFrames, pitfallCaption, reasonText, shapeFrames } from './frames';
import {
  ASYNC_SRC, CALLER_SRC, COMBINATORS, DESUGARED_SRC, DURATION, MACHINE, PITFALLS, REQS, SHAPE_CODE, predict, shapeRun,
  type Combinator, type Outcome, type PitfallId, type ReqId, type ReqSetting, type Shape,
} from './model';
import './styles.css';

type SceneId = 'shapes' | 'combinators' | 'machine' | 'pitfalls';

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({
    label: 'Scene',
    options: [
      { value: 'shapes', label: 'Sequential vs parallel' },
      { value: 'combinators', label: 'Combinators' },
      { value: 'machine', label: 'State machine' },
      { value: 'pitfalls', label: 'Pitfalls' },
    ],
    initial: 'shapes',
  });
  if (scene === 'shapes') return <ShapesScene picker={picker} />;
  if (scene === 'combinators') return <CombinatorScene picker={picker} />;
  if (scene === 'machine') return <MachineScene picker={picker} />;
  return <PitfallScene picker={picker} />;
}

const TIMERS_NOTE = 'Requests are timers with illustrative durations; the promise behaviour is real JavaScript (the tests run this code).';

/* ---------- sequential vs parallel ---------- */

const SHAPES: { value: Shape; label: string }[] = [
  { value: 'sequential', label: 'await one by one' },
  { value: 'all', label: 'Promise.all' },
  { value: 'startFirst', label: 'start all, then await' },
];

function ShapesScene({ picker }: { picker: ReactNode }) {
  const [shape, setShape] = useState<Shape>('sequential');
  const frames = useMemo(() => shapeFrames(shape), [shape]);
  const player = usePlayer(frames, { interval: 1500 });
  const run = shapeRun(shape);
  const now = player.frame.now;
  const activeLines = run.waits.filter((w) => w.start <= now && now < w.end).map((w) => w.line);
  const bars: GanttBar[] = [
    ...run.waits.filter((w) => w.end > w.start).map((w, i) => ({ id: `w${i}`, lane: 'load', start: w.start, end: w.end, tone: 'muted' as const, kind: 'blocked' as const, label: `await ${w.on}` })),
    ...run.requests.map((r) => ({ id: r.id, lane: r.id, start: r.start, end: r.end, tone: 'info' as const, label: `${r.id}() ${DURATION[r.id]} ms` })),
  ];
  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Total" value={`${run.total} ms`} color={run.total === Math.max(...REQS.map((id) => DURATION[id])) ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Sum of the three" value={`${REQS.reduce((a, id) => a + DURATION[id], 0)} ms`} />
          <Stat label="Slowest one" value={`${Math.max(...REQS.map((id) => DURATION[id]))} ms`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a request in flight' },
            { color: 'var(--muted)', label: 'load() suspended at an await (dashed)' },
            { color: 'var(--hi)', label: 'now; the await it is waiting at', shape: 'line' },
            { color: 'var(--ok)', label: 'total = the slowest' },
            { color: 'var(--bad)', label: 'total = the sum' },
          ]}
        />
      }
      controls={[picker, <Segmented key="s" label="Code" value={shape} onChange={setShape} options={SHAPES} />]}
    >
      <div className="aac stage-pad">
        <CodePanel title="load()" lines={SHAPE_CODE[shape]} active={activeLines} />
        <WideRegion minWidth={420} label="Timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={[{ id: 'load', label: 'load()' }, ...REQS.map((id) => ({ id, label: `${id}()` }))]}
            bars={bars}
            domain={[0, 1000]}
            now={now}
            unit=" ms"
            axis
            size="md"
            ariaLabel="Timeline of the three requests and when load() is suspended"
          />
        </WideRegion>
        <Hint block>{TIMERS_NOTE} While load() is suspended, the thread runs other code: await pauses the function, not the program.</Hint>
      </div>
    </StageFrame>
  );
}

/* ---------- combinators ---------- */

const TIMES = [100, 200, 300, 500];
const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'resolve', label: 'resolve' },
  { value: 'reject', label: 'reject' },
];

function CombinatorScene({ picker }: { picker: ReactNode }) {
  const [settings, setSettings] = useState<Record<ReqId, ReqSetting>>({
    a: { outcome: 'resolve', at: 300 },
    b: { outcome: 'reject', at: 100 },
    c: { outcome: 'resolve', at: 200 },
  });
  const [combinator, setCombinator] = useState<Combinator>('all');
  const result = predict(combinator, settings);
  useIntroCaption(combinatorCaption(combinator, settings), [combinator, JSON.stringify(settings)]);
  const set = (id: ReqId, patch: Partial<ReqSetting>) => setSettings({ ...settings, [id]: { ...settings[id], ...patch } });

  const bars: GanttBar[] = REQS.flatMap((id) => {
    const s = settings[id];
    const ring = s.outcome === 'resolve' ? ('ok' as const) : ('bad' as const);
    const cut = Math.min(s.at, result.at);
    const before: GanttBar = { id: `${id}-a`, lane: id, start: 0, end: cut, tone: 'info', ring: s.at <= result.at ? ring : undefined, label: s.at <= result.at ? `${s.outcome === 'resolve' ? 'fulfils' : 'rejects'}` : `${id}()` };
    // After the combinator settles, a request still running is drawn dim, with an outline.
    const after: GanttBar[] = s.at > result.at ? [{ id: `${id}-b`, lane: id, start: result.at, end: s.at, tone: 'dim', ring, label: `still ${s.outcome === 'resolve' ? 'fulfils' : 'rejects'}` }] : [];
    return [before, ...after];
  });

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label={`Promise.${combinator}`} value={result.status} color={result.status === 'fulfilled' ? 'var(--ok)' : 'var(--bad)'} sub={`at ${result.at} ms`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request in flight' },
            { color: 'var(--ok)', label: 'fulfilled (outline, result)' },
            { color: 'var(--bad)', label: 'rejected (outline, result)' },
            { color: 'var(--dim)', label: 'still running after the combinator settled' },
          ]}
        />
      }
      controls={[
        picker,
        <Segmented key="c" label="Combinator" value={combinator} onChange={setCombinator} options={COMBINATORS.map((c) => ({ value: c, label: `Promise.${c}` }))} />,
        <div key="r" className="aac-reqs">
          {REQS.map((id) => (
            <div key={id} className="aac-req">
              <Segmented label={`${id}()`} value={settings[id].outcome} onChange={(o) => set(id, { outcome: o })} options={OUTCOMES} />
              <Segmented ariaLabel={`${id}() settles after`} value={settings[id].at} onChange={(t) => set(id, { at: t })} options={TIMES.map((t) => ({ value: t, label: `${t} ms` }))} />
            </div>
          ))}
        </div>,
      ]}
    >
      <div className="aac stage-pad">
        <WideRegion minWidth={420} label="Timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={REQS.map((id) => ({ id, label: `${id}()` }))}
            bars={bars}
            domain={[0, Math.max(...TIMES)]}
            markers={[{ at: result.at, label: `${combinator} ${result.status === 'fulfilled' ? 'fulfils' : 'rejects'}`, tone: result.status === 'fulfilled' ? 'ok' : 'bad' }]}
            unit=" ms"
            axis
            size="md"
            ariaLabel="When each request settles, and when the combinator does"
          />
        </WideRegion>
        <div className="aac-scroll">
          <table className="data-table aac-table">
            <thead>
              <tr>
                <th>combinator</th>
                <th>settles</th>
                <th>with</th>
              </tr>
            </thead>
            <tbody>
              {COMBINATORS.map((c) => {
                const r = predict(c, settings);
                return (
                  <tr key={c} className={c === combinator ? 'is-picked' : ''}>
                    <td><code>Promise.{c}</code></td>
                    <td className={r.status === 'fulfilled' ? 'aac-ok' : 'aac-bad'}>{r.status} at {r.at} ms</td>
                    <td><code>{r.status === 'fulfilled' ? r.value : reasonText(r.reason)}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Hint block>
          {TIMERS_NOTE} all: the first rejection, or every value. allSettled: always fulfils, with every status. race: whichever settles first. any: the first fulfilment, or an
          AggregateError if all reject. None of them cancels the others; to stop work, pass an AbortController&apos;s signal to it and call abort().
        </Hint>
        <p className="sr-only" aria-live="polite">Promise.{combinator} {fmtSettled(result)}</p>
      </div>
    </StageFrame>
  );
}

/* ---------- the state machine ---------- */

function MachineScene({ picker }: { picker: ReactNode }) {
  const frames = useMemo(() => machineFrames(), []);
  const player = usePlayer(frames, { interval: 1900 });
  const { step, printed } = player.frame;
  const started = player.index >= MACHINE.findIndex((m) => m.frame !== null);
  const stackFrames = step.stack.map((name, i) => ({ id: i, name, state: i === 0 ? ('running' as const) : ('waiting' as const) }));
  return (
    <StageFrame
      player={player}
      height={600}
      stats={
        <Stats>
          <Stat label="checkout()" value={step.frame === null ? (started ? 'done' : 'not started') : step.suspended ? 'suspended' : 'running'} color={step.suspended ? 'var(--violet)' : undefined} />
          <Stat label="state" value={step.frame?.state ?? '–'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the line running now (or where it is parked)' },
            { color: 'var(--violet)', label: 'locals parked on the heap' },
            { color: 'var(--ok)', label: 'printed output' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="aac stage-pad">
        <div className="aac-row">
          <CodePanel className="aac-code" title="what you write" lines={ASYNC_SRC} active={step.asyncLine >= 0 ? step.asyncLine : null} />
          <CodePanel className="aac-code" title="the caller" lines={CALLER_SRC} active={step.callerLine >= 0 ? step.callerLine : null} />
        </div>
        <div className="aac-row">
          <CodePanel className="aac-code aac-wide" title="roughly what it becomes: a state machine" lines={DESUGARED_SRC} active={step.sugarLine >= 0 ? step.sugarLine : null} />
          <div className="aac-side">
            <CallStackPanel frames={stackFrames} meta={step.stack.length ? `${step.stack.length} on the stack` : 'stack empty'} empty={<p className="empty-note">nothing running: the event loop waits</p>} anchor="top" />
            <div className={`aac-frame ${step.frame ? '' : 'is-empty'}`}>
              <SectionTitle>checkout&apos;s frame object (heap)</SectionTitle>
              {step.frame ? (
                <table className="aac-locals">
                  <tbody>
                    {Object.entries(step.frame).map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td><code>{String(v)}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-note">none</p>
              )}
            </div>
            <ConsolePanel title="console" lines={printed} empty="(nothing yet)" />
          </div>
        </div>
        <Hint block>
          JavaScript&apos;s async functions are stackless coroutines: only the one function&apos;s locals are saved, and an await can only suspend the function it is written in.
          Stackful coroutines, such as Lua&apos;s, keep a whole stack and can pause from deep inside nested calls. The desugared form is simplified: real
          engines also handle errors (try/catch across awaits) and differ in how many microtask ticks each step takes.
        </Hint>
      </div>
    </StageFrame>
  );
}

/* ---------- pitfalls ---------- */

function PitfallScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<PitfallId>('noAwait');
  const [fixed, setFixed] = useState(false);
  const p = PITFALLS.find((x) => x.id === id)!;
  useIntroCaption(pitfallCaption(p, fixed), [id, fixed]);
  const lines = fixed ? p.fixed : p.code;
  const state = (i: number): LineState => (fixed ? (p.fixLines.includes(i) ? 'good' : 'idle') : i === p.badLine ? 'bad' : 'idle');
  const out: ConsoleLine[] = fixed ? p.fixedOut : [...p.out, ...(p.unhandled ? [{ text: p.unhandled, tone: 'bad' as const }] : [])];
  return (
    <StageFrame
      height={380}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the bug; an unhandled rejection' },
            { color: 'var(--ok)', label: 'the fix; printed output' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Pitfall" value={id} onChange={setId} options={PITFALLS.map((x) => ({ value: x.id, label: x.label }))} />
          <Toggle label="Fix" value={fixed} onChange={setFixed} off="Off" on="On" />
        </>,
      ]}
    >
      <div className="aac stage-pad">
        <div className="aac-row">
          <CodePanel className="aac-code aac-pit" title={fixed ? 'fixed' : 'as written'} lines={lines} stateOf={state} />
          <ConsolePanel title="console (as Chrome prints it)" lines={out} empty="(nothing printed)" />
        </div>
        <Hint block>
          The printed lines are what Node prints for this code (the tests run each snippet); the red line is how Chrome&apos;s console reports the unhandled rejection. Node
          prints the error too, and by default exits with code 1.
        </Hint>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { pct, plural } from '../../core/format';
import { usePlayer, type Player } from '../../core/usePlayer';
import { bufferFrames, bugScene, type ScFrame } from './frames';
import { firstBadSeed, programs, type Config, type Mode, type Thread } from './model';
import { SHOWN_TONE, WINDOW, cpuWindow, laneBars, shownStatus } from './view';
import './styles.css';

const STEP_MS = 500;
const BUG_STEP_MS = 1100;
const ITEMS_EACH = 6;
const MAX_IO_TICKS = 12;
const TIMELINE_MIN_WIDTH = 480;
/** The CPU meter turns red once spinning is more than this share of recent ticks. */
const SPIN_ALARM = 0.5;

type Scene = 'buffer' | 'bugs';
type Bug = 'singleSignal' | 'singleBroadcast' | 'lostWakeup';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'buffer', label: 'Bounded buffer' },
      { value: 'bugs', label: 'Wake-up bugs' },
    ],
    initial: 'buffer',
  });
  return scene === 'buffer' ? <BufferScene picker={picker} /> : <BugScene picker={picker} />;
}

const STATUS_LABEL = { running: 'running', ready: 'ready', asleep: 'asleep', io: 'I/O', done: 'done' } as const;

function ThreadChip({ f, t }: { f: ScFrame; t: Thread }) {
  const s = shownStatus(f, t);
  return (
    <span className={`sc-chip tone-${SHOWN_TONE[s]} is-${s}`} title={`${t.id}: ${STATUS_LABEL[s]}`}>
      {t.id}
    </span>
  );
}

/** Producer and consumer code, each thread's chip on the line it's at. */
function Code({ f, c }: { f: ScFrame; c: Config }) {
  const p = programs(c.variant, c.ifBug);
  const panel = (role: 'producer' | 'consumer') => {
    const lines = p[role];
    // A thread asleep in sleep() resumes at the check above it, but it is sleeping on the sleep() line.
    const sleepLine = lines.findIndex((l) => l.op.op === 'sleep');
    const lineOf = (t: Thread) => (f.active === t.id ? f.line : t.status === 'asleep' && t.on === 'wakeup' ? sleepLine : t.pc);
    const here = (i: number) => f.threads.filter((t) => t.role === role && t.status !== 'done' && lineOf(t) === i);
    return (
      <CodePanel
        title={role === 'producer' ? 'producer (once per item)' : 'consumer (once per item)'}
        lines={lines.map((l) => l.text)}
        stateOf={(i) => (f.active !== null && f.threads.find((t) => t.id === f.active)!.role === role && f.line === i ? 'now' : 'idle')}
        trailing={(i) => (
          <span className="sc-chips">
            {here(i).map((t) => <ThreadChip key={t.id} f={f} t={t} />)}
          </span>
        )}
        className="sc-code"
      />
    );
  };
  return (
    <div className="sc-codes">
      {panel('producer')}
      {panel('consumer')}
    </div>
  );
}

function Tokens({ name, n, sleepers }: { name: string; n: number; sleepers: readonly string[] }) {
  return (
    <div className="sc-prim">
      <code>{name}</code>
      <span className="sc-tokens" aria-label={`${name}: ${plural(n, 'token')}`}>
        {Array.from({ length: n }, (_, i) => <i key={i} className="sc-token" />)}
        <b>{n}</b>
      </span>
      <span className="sc-queue">{sleepers.length ? <>asleep: {sleepers.join(', ')}</> : 'nobody asleep'}</span>
    </div>
  );
}

function Queue({ name, ids }: { name: string; ids: readonly string[] }) {
  return (
    <div className="sc-prim">
      <code>{name}</code>
      <span className="sc-queue">{ids.length ? <>asleep: {ids.join(', ')}</> : 'nobody asleep'}</span>
    </div>
  );
}

/** The synchronisation state: semaphore token piles, the lock and its condition variables. */
function Primitives({ f, c }: { f: ScFrame; c: Config }) {
  const q = (k: string) => f.queues[k] ?? [];
  const woken = f.threads.filter((t) => t.woken).map((t) => t.id);
  return (
    <div className="sc-prims" aria-label="Synchronisation state">
      {c.variant === 'semaphore' ? (
        <>
          <Tokens name="empty" n={f.sems.empty} sleepers={q('empty')} />
          <Tokens name="full" n={f.sems.full} sleepers={q('full')} />
          <Tokens name="mutex" n={f.sems.mutex} sleepers={q('mutex')} />
        </>
      ) : (
        <>
          <div className="sc-prim">
            <code>m</code>
            <span className={f.owner ? 'sc-held' : 'sc-free'}>{f.owner ? `held by ${f.owner}` : 'free'}</span>
            <span className="sc-queue">{q('m').length ? <>blocked: {q('m').join(', ')}</> : 'nobody blocked'}</span>
          </div>
          {c.variant === 'monitor' && (
            <>
              <Queue name="notFull" ids={q('notFull')} />
              <Queue name="notEmpty" ids={q('notEmpty')} />
            </>
          )}
          {(c.variant === 'singleSignal' || c.variant === 'singleBroadcast') && <Queue name="changed" ids={q('changed')} />}
          {c.variant === 'lostWakeup' && <Queue name="sleep()" ids={q('wakeup')} />}
          {woken.length > 0 && <span className="sc-woken">woken, must re-take m: {woken.join(', ')}</span>}
        </>
      )}
    </div>
  );
}

function Buffer({ f, c }: { f: ScFrame; c: Config }) {
  const garbage = f.note.kind === 'violation' || (f.note.kind === 'take' && f.note.garbage) || (f.note.kind === 'put' && f.note.overflow);
  return (
    <div className="sc-buffer">
      <SectionTitle hint={`count ${Math.max(0, f.count)} of ${c.capacity}`}>Buffer</SectionTitle>
      <ArrayStrip
        values={f.slots.map((s) => s ?? '')}
        cellState={(i) => (garbage && (i === f.head || i === (f.tail - 1 + c.capacity) % c.capacity) ? 'bad' : f.slots[i] ? 'info' : 'idle')}
        pointers={
          f.head === f.tail
            ? [{ i: f.head, label: 'head = tail', tone: 'violet', id: 'head' }]
            : [
                { i: f.head, label: 'head', tone: 'violet', id: 'head' },
                { i: f.tail, label: 'tail', tone: 'violet', id: 'tail' },
              ]
        }
        showIndex
        fontSize={11}
        cellMax={64}
        cellTitle={(i) => `slot ${i}: ${f.slots[i] ?? 'empty'}`}
      />
    </div>
  );
}

function Timeline({ frames, player }: { frames: ScFrame[]; player: Player<ScFrame> }) {
  const f = player.frame;
  const end = Math.max(WINDOW, f.tick);
  return (
    <WideRegion minWidth={TIMELINE_MIN_WIDTH} label="Thread timeline: scroll sideways to see all of it">
      <GanttLanes
        lanes={f.threads.map((t) => ({ id: t.id, label: t.id }))}
        bars={laneBars(frames, player.index)}
        domain={[end - WINDOW, end]}
        now={f.tick}
        axis
        unit=" t"
        size="sm"
        labelWidth={40}
        ariaLabel={`What each thread did over the last ${WINDOW} ticks`}
      />
    </WideRegion>
  );
}

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'running', shape: 'square' },
      { color: 'var(--info)', label: 'ready / woken', shape: 'square' },
      { color: 'var(--dim)', label: 'asleep or blocked', shape: 'square' },
      { color: 'var(--muted)', label: 'off the CPU (I/O)', shape: 'square' },
      { color: 'var(--violet)', label: 'semaphore token', shape: 'dot' },
      { color: 'var(--bad)', label: 'garbage / stuck', shape: 'square' },
    ]}
  />
);

function CpuStat({ f }: { f: ScFrame }) {
  const { busy, spin } = cpuWindow(f.cpu);
  const alarm = spin > SPIN_ALARM;
  return (
    <Stat label="CPU, last 20 ticks" value={pct(busy)} color={alarm ? 'var(--bad)' : 'var(--muted)'} sub={`${pct(spin)} spent spinning`}>
      <Bar value={busy} max={1} tone={alarm ? 'bad' : 'info'} height={6} />
    </Stat>
  );
}

function BufferScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<Mode>('monitor');
  const [capacity, setCapacity] = useState(4);
  const [producers, setProducers] = useState(1);
  const [consumers, setConsumers] = useState(2);
  const [produceTicks, setProduceTicks] = useState(2);
  const [consumeTicks, setConsumeTicks] = useState(4);
  const [ifBug, setIfBug] = useState(false);
  const [seed, setSeed] = useState(1);
  const [search, setSearch] = useState<string | null>(null);

  const config: Config = { variant: mode, capacity, producers, consumers, itemsEach: ITEMS_EACH, produceTicks, consumeTicks, ifBug: mode === 'monitor' && ifBug };
  // Memoised on the settings' text, since `config` is a fresh object every render.
  const key = JSON.stringify(config);
  const frames = useMemo(() => bufferFrames(JSON.parse(key) as Config, seed), [key, seed]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const total = producers * ITEMS_EACH;

  const findBad = () => {
    const s = firstBadSeed(config, seed + 1);
    setSearch(s === null ? 'No failing seed in the next 200 with these settings.' : null);
    if (s !== null) setSeed(s);
  };

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Tick" value={f.tick} color="var(--hi)" />
          <Stat label="Items through" value={`${f.consumed.length} of ${total}`} color={f.consumed.length === total ? 'var(--ok)' : 'var(--info)'} />
          <CpuStat f={f} />
        </Stats>
      }
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented
            label="Waiting with"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'busy', label: 'Busy-wait' },
              { value: 'semaphore', label: 'Semaphores' },
              { value: 'monitor', label: 'Monitor' },
            ]}
          />
          {mode === 'monitor' && <Toggle label="Condition check" value={ifBug} onChange={setIfBug} off="while (correct)" on="if (bug)" />}
        </>,
        <>
          <Slider label="Capacity N" value={capacity} min={1} max={8} onChange={setCapacity} />
          <Segmented label="Producers" value={producers} onChange={setProducers} options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
          <Segmented label="Consumers" value={consumers} onChange={setConsumers} options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
        </>,
        <>
          <Slider label="produce() takes" value={produceTicks} min={0} max={MAX_IO_TICKS} onChange={setProduceTicks} format={(v) => plural(v, 'tick')} />
          <Slider label="consume() takes" value={consumeTicks} min={0} max={MAX_IO_TICKS} onChange={setConsumeTicks} format={(v) => plural(v, 'tick')} />
          <ChipButton tone="info" size="md" onClick={() => setSeed(seed + 1)}>
            Seed {seed}: try another
          </ChipButton>
          {config.ifBug && (
            <Button onClick={findBad}>Find a seed where it breaks</Button>
          )}
          {search && <Hint tone="muted">{search}</Hint>}
        </>,
      ]}
    >
      <div className="sc stage-pad">
        <div className="sc-top">
          <Buffer f={f} c={config} />
          <Primitives f={f} c={config} />
        </div>
        <Code f={f} c={config} />
        <Timeline frames={frames} player={player} />
        <Hint block>
          A simulated scheduler on one CPU picks who runs next, one line per tick, from a seed (try another to get a different interleaving); real
          threads are scheduled by the OS, on many cores. Each producer makes {ITEMS_EACH} items and the consumers split them evenly. produce() and
          consume() are modelled as I/O off the CPU, with illustrative tick counts. The lock lets threads barge in, as pthread mutexes do.
        </Hint>
      </div>
    </StageFrame>
  );
}

const BUGS: { value: Bug; label: string }[] = [
  { value: 'singleSignal', label: 'One CV + signal' },
  { value: 'singleBroadcast', label: 'One CV + broadcast' },
  { value: 'lostWakeup', label: 'Check without the lock' },
];

function BugScene({ picker }: { picker: ReactNode }) {
  const [bug, setBug] = useState<Bug>('singleSignal');
  const scene = useMemo(() => bugScene(bug), [bug]);
  const player = usePlayer(scene.frames, { interval: BUG_STEP_MS });
  const f = player.frame;
  const { ex, config } = scene;
  const replayed = ex.example.stuck ? 'one that hangs' : 'the first one found';

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Tick" value={f.tick} color="var(--hi)" />
          <Stat
            label="Schedules that hang"
            value={`${ex.stuck.toLocaleString('en-US')} of ${ex.schedules.toLocaleString('en-US')}`}
            color={ex.stuck ? 'var(--bad)' : 'var(--ok)'}
            sub="every interleaving, enumerated"
          />
        </Stats>
      }
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="Bug" value={bug} onChange={setBug} options={BUGS} />
        </>,
      ]}
    >
      <div className="sc stage-pad">
        <div className="sc-top">
          <Buffer f={f} c={config} />
          <Primitives f={f} c={config} />
        </div>
        <Code f={f} c={config} />
        <Timeline frames={scene.frames} player={player} />
        <Hint block>
          Every possible order of the threads' lines was enumerated ({plural(config.producers, 'producer')} making {plural(config.itemsEach, 'item')},{' '}
          {plural(config.consumers, 'consumer')}, a buffer of {config.capacity}); the player replays {replayed}. Real threads interleave the same way,
          just at random. POSIX also lets a condition wait return with no signal at all (a spurious wake-up), one more reason to re-check in a loop.
        </Hint>
      </div>
    </StageFrame>
  );
}

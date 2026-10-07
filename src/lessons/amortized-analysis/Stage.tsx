import { useMemo, useState, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { Bars, Curve, HLine, Plot2D, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { pushFrames, trapFrames, type AmFrame } from './frames';
import {
  COINS_PER_OP, cumulativeCost, growthLabel, GROWTHS, MAX_PUSHES, pushes, run, START_CAP, TRAP_FILL, TRAP_OPS, type Growth, type Step,
} from './model';
import './styles.css';

const PUSH_STEP_MS = 650;
const TRAP_STEP_MS = 1000;
/** Slots per drawn row: the block is one contiguous run of memory, wrapped for the screen. */
const ROW = 16;
const CELL_MAX = 40;
const CELL_GAP = 3;
const BATCH = 8;
/** The total-cost plot runs further than the playground, so the curves' shapes show. */
const PLOT_N = 200;
/** Coins drawn as dots before the rest is written as "+k". */
const COIN_DOTS = 40;
const GROWTH_TONE: Record<Growth, Tone> = { double: 'sky', 'x1.5': 'amber', plus10: 'pink' };

type Scene = 'push' | 'trap';
const SCENES = [
  { value: 'push' as const, label: 'Push and grow' },
  { value: 'trap' as const, label: 'Pop-shrink trap' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'push' });
  return scene === 'push' ? <PushScene picker={picker} /> : <TrapScene picker={picker} />;
}

/** The array as rows of slots; `state(i)` colours slot i. */
function Block({ values, label, state }: { values: readonly (number | null)[]; label: ReactNode; state: (i: number) => ArrayCellState }) {
  const rows = Array.from({ length: Math.ceil(values.length / ROW) }, (_, k) => values.slice(k * ROW, (k + 1) * ROW));
  return (
    <div className="am-block" style={{ maxWidth: ROW * CELL_MAX + (ROW - 1) * CELL_GAP }}>
      <div className="am-block-label">{label}</div>
      {rows.map((r, k) => (
        // Every row's cells are the width of a full row's, so short rows don't stretch.
        <div key={k} className="am-row" style={{ width: `calc((100% + ${CELL_GAP}px) * ${r.length} / ${ROW} - ${CELL_GAP}px)` }}>
          <ArrayStrip
            values={r.map((v) => v ?? '')}
            fontSize={11}
            cellState={(i) => state(k * ROW + i)}
            cellClass={(i) => (state(k * ROW + i) === 'info' ? 'am-filled' : '')}
            cellTitle={(i) => `slot ${k * ROW + i}${r[i] === null ? ', empty' : `, element ${r[i]}`}`}
          />
        </div>
      ))}
    </div>
  );
}

function Blocks({ f }: { f: AmFrame }) {
  const used = f.block.filter((v) => v !== null).length;
  return (
    <div className="am-blocks" aria-label="Array memory">
      {f.old && <Block values={f.old} label={<>old block · {f.old.length} slots</>} state={(i) => (i < f.copied ? 'violet' : 'info')} />}
      <Block
        values={f.block}
        label={<>{f.old ? 'new block' : 'block'} · {used} of {f.block.length} slots used</>}
        state={(i) => (i === f.writing ? 'active' : i < f.copied ? 'violet' : f.block[i] !== null ? 'info' : 'dim')}
      />
    </div>
  );
}

function Bank({ balance }: { balance: number }) {
  const dots = Math.min(Math.max(balance, 0), COIN_DOTS);
  return (
    <Tray label={`Bank: ${COINS_PER_OP} coins in per operation, 1 out per write`} labelWeight="regular" stack ariaLabel="Bank">
      <div className="am-coins" aria-label={`${balance} coins`}>
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className="am-coin" />
        ))}
        {balance > COIN_DOTS && <span className="am-coin-more">+{balance - COIN_DOTS}</span>}
        {balance < 0 && <span className="am-debt">{balance}: overdrawn</span>}
        {balance === 0 && <span className="am-coin-more">empty</span>}
      </div>
    </Tray>
  );
}

/** Room above the tallest bar, so it never looks cut off at the frame. */
const Y_HEADROOM = 1.15;

/** Cost of each operation so far as bars (resizes red, plain writes green) with the running average. */
function CostBars({ steps, done, xMax, yMax, unit }: { steps: readonly Step[]; done: number; xMax: number; yMax: number; unit: string }) {
  const shown = steps.slice(0, done);
  const totals = shown.map((_, i) => shown.slice(0, i + 1).reduce((t, x) => t + x.cost, 0));
  const average = shown.map((s, i) => [s.n, totals[i] / s.n] as const);
  return (
    <div className="am-plot">
      <Plot2D x={{ domain: [0, xMax], label: unit }} y={{ domain: [0, Math.ceil(yMax * Y_HEADROOM)], label: 'writes' }} height={200} ariaLabel={`Cost of each ${unit}`}>
        <Bars bars={shown.map((s) => ({ x0: s.n - 0.5, x1: s.n + 0.5, y: s.cost, tone: s.copies ? 'bad' : 'ok' }))} />
        <HLine at={COINS_PER_OP} label={`${COINS_PER_OP} per op`} tone="dim" />
        {average.length > 1 && <Curve points={average} tone="muted" />}
      </Plot2D>
      <Legend
        items={[
          { color: 'var(--ok)', label: 'cost 1', shape: 'square' },
          { color: 'var(--bad)', label: 'resize: 1 + copies', shape: 'square' },
          { color: 'var(--muted)', label: 'running average', shape: 'line' },
        ]}
      />
    </div>
  );
}

function PushScene({ picker }: { picker: ReactNode }) {
  const [growth, setGrowth] = useState<Growth>('double');
  const [n, setN] = useState(0);
  const [batch, setBatch] = useState(1);
  const frames = useMemo(() => pushFrames(n, batch, growth), [n, batch, growth]);
  const player = usePlayer(frames, { interval: PUSH_STEP_MS });
  const f = player.frame;
  const allSteps = useMemo(() => run(pushes(MAX_PUSHES), growth), [growth]);
  const yMax = Math.max(...allSteps.map((s) => s.cost));
  const curves = useMemo(() => GROWTHS.map((g) => ({ ...g, points: cumulativeCost(PLOT_N, g.id).map((v, k) => [k, v] as const) })), []);
  const plotMax = Math.max(...curves.map((c) => c.points[PLOT_N][1]));
  const rule = GROWTHS.find((g) => g.id === growth)!.rule;

  const add = (k: number) => {
    setN(n + k);
    setBatch(k);
  };

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Pushes" value={f.done} color="var(--info)" sub={`of ${MAX_PUSHES} max`} />
          <Stat label="Total writes" value={f.total} color="var(--muted)" />
          <Stat label="Average per push" value={f.done ? (f.total / f.done).toFixed(2) : '–'} color="var(--muted)" />
          <Stat label="Bank" value={<AnimatedValue value={f.balance} />} color={f.balance < 0 ? 'var(--bad)' : 'var(--hi)'} sub="coins" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'slot being written', shape: 'square' },
            { color: 'var(--info)', label: 'filled', shape: 'square' },
            { color: 'var(--violet)', label: 'copied in a resize', shape: 'square' },
            { color: 'var(--dim)', label: 'empty capacity', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Growth" value={growth} onChange={setGrowth} options={GROWTHS.map((g) => ({ value: g.id, label: g.label }))} />
        </>,
        <>
          <Button variant="primary" onClick={() => add(1)} disabled={n >= MAX_PUSHES}>
            Push
          </Button>
          <Button onClick={() => add(Math.min(BATCH, MAX_PUSHES - n))} disabled={n >= MAX_PUSHES}>
            Push {Math.min(BATCH, Math.max(1, MAX_PUSHES - n))} more
          </Button>
          <Button onClick={() => add(-n)} disabled={n === 0}>
            Reset
          </Button>
          {n >= MAX_PUSHES && <Hint>That's the {MAX_PUSHES}-push limit: Reset to start again.</Hint>}
        </>,
      ]}
    >
      <div className="am stage-pad">
        <Blocks f={f} />
        <div className="am-panels">
          <CostBars steps={allSteps} done={f.done} xMax={MAX_PUSHES} yMax={yMax} unit="push" />
          <div className="am-plot">
            <Plot2D x={{ domain: [0, PLOT_N], label: 'pushes' }} y={{ domain: [0, plotMax], label: 'total writes' }} height={200} ariaLabel="Total writes against pushes for each growth policy">
              <Curve fn={(x) => COINS_PER_OP * x} tone="dim" dashed />
              {curves.map((c) => (
                <Curve key={c.id} points={c.points} tone={GROWTH_TONE[c.id]} dashed={c.id !== growth} width={c.id === growth ? 3 : 1.5} />
              ))}
              <VLine at={f.done} label={`n = ${f.done}`} tone="hi" />
            </Plot2D>
            <Legend
              items={[
                ...curves.map((c) => ({ color: `var(--${GROWTH_TONE[c.id]})`, label: c.label, shape: 'line' as const })),
                { color: 'var(--dim)', label: `${COINS_PER_OP}n`, shape: 'line' as const },
              ]}
            />
          </div>
          <Bank balance={f.balance} />
        </div>
        <Hint block>
          Nothing simulated: computed live. Costs are counted in element writes (a push writes 1, a resize writes 1 per element copied); real
          allocators and memcpy change the constants, not the shape. Starting capacity {START_CAP}; {growthLabel(growth)}: {rule}. The total-writes plot
          runs to {PLOT_N} pushes. Each block is one contiguous run of memory, drawn {ROW} slots to a row.
        </Hint>
      </div>
    </StageFrame>
  );
}

function TrapScene({ picker }: { picker: ReactNode }) {
  const [shrink, setShrink] = useState<'half' | 'quarter'>('half');
  const frames = useMemo(() => trapFrames(shrink), [shrink]);
  const player = usePlayer(frames, { interval: TRAP_STEP_MS });
  const f = player.frame;
  const steps = useMemo(() => run(TRAP_OPS, 'double', shrink), [shrink]);
  const copiesSoFar = steps.slice(TRAP_FILL, f.done).reduce((t, s) => t + s.copies, 0);

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Operations" value={f.done} color="var(--info)" sub={`${TRAP_FILL} pushes, then push/pop`} />
          <Stat label="Copies after the fill" value={copiesSoFar} color={copiesSoFar ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Bank" value={<AnimatedValue value={f.balance} />} color={f.balance < 0 ? 'var(--bad)' : 'var(--hi)'} sub="coins" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'slot written or cleared', shape: 'square' },
            { color: 'var(--info)', label: 'filled', shape: 'square' },
            { color: 'var(--violet)', label: 'copied in a resize', shape: 'square' },
            { color: 'var(--dim)', label: 'empty capacity', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented
            label="Shrink when a pop leaves it"
            value={shrink}
            onChange={setShrink}
            options={[
              { value: 'half', label: '½ full' },
              { value: 'quarter', label: '¼ full' },
            ]}
          />
        </>,
      ]}
    >
      <div className="am stage-pad">
        <Blocks f={f} />
        <div className="am-panels">
          <CostBars steps={steps} done={f.done} xMax={TRAP_OPS.length} yMax={Math.max(...steps.map((s) => s.cost))} unit="operation" />
          <Bank balance={f.balance} />
        </div>
        <Hint block>
          Nothing simulated: computed live, with doubling growth from capacity {START_CAP}. A pop clears 1 slot (cost 1) and a shrink halves the
          capacity, copying what's left. Costs are counted in element writes; real allocators and memcpy change the constants, not the shape.
        </Hint>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { Packet, SceneNode } from '../../components/scene';
import { Sparkline } from '../../components/Sparkline';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ControlGroup, Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { duration, pct } from '../../core/format';
import { percentile } from '../../core/sim';
import { usePlayer } from '../../core/usePlayer';
import { CostPanel } from './CostPanel';
import { poolFrames } from './frames';
import { arrivals, costs, DEFAULT_CONFIG, HANDLER_S, HORIZON, simulate, summaryAt, type Config, type Profile } from './model';
import { laneCount, poolBars, slotLane, slotsAt, THROTTLE_LANE, windowAt } from './view';

const STEP_MS = 320;
/** Narrowest width where the instance boxes' 10px labels and the timeline stay readable. */
const POOL_MIN_W = 520;
const PROFILES: { value: Profile; label: string; peakRate: number }[] = [
  { value: 'spiky', label: 'Spiky traffic', peakRate: 6 },
  { value: 'steady', label: 'Steady traffic', peakRate: 6 },
  { value: 'batch', label: 'Nightly batch', peakRate: 6 },
];

const COLS = 5;
const NODE = { w: 74, h: 44 };
const PITCH = { x: 82, y: 54 };
const GRID_X = 168;
const SCENE_W = 580;
const SCENE_PAD = 16;
const SOURCE_X = 58;
const MAX_PACKETS = 6;
const SPARK_CAP = 80;
/** Widest bar label ("provision") in px at the Gantt's 10.5px mono, plus padding. */
const BAR_LABEL_PX = 9 * 7 + 12;

const SLOT_SUB = { provision: 'provision', runtime: 'runtime', init: 'init', handler: 'handling', idle: 'warm, idle', reaped: 'reaped' } as const;

export function PoolScene({ picker }: { picker: ReactNode }) {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const set = (patch: Partial<Config>) => setCfg((c) => ({ ...c, ...patch }));
  const times = useMemo(() => arrivals(cfg), [cfg]);
  const run = useMemo(() => simulate(cfg, times), [cfg, times]);
  const frames = useMemo(() => poolFrames(run), [run]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { now, fresh } = player.frame;
  const sum = summaryAt(run, now);
  const sorted = [...sum.latencies].sort((a, b) => a - b);
  const cost = useMemo(() => costs(run, times), [run, times]);

  const slots = Math.max(laneCount(run), 1);
  const rows = Math.ceil(slots / COLS);
  const sceneH = rows * PITCH.y + SCENE_PAD;
  const nodeAt = (slot: number) => ({ x: GRID_X + (slot % COLS) * PITCH.x, y: SCENE_PAD / 2 + NODE.h / 2 + Math.floor(slot / COLS) * PITCH.y });
  const sourceAt = { x: SOURCE_X, y: sceneH / 2 };
  const [lo, hi] = windowAt(now);

  const lanes = [
    ...Array.from({ length: slots }, (_, s) => ({ id: slotLane(s), label: `instance ${s + 1}` })),
    { id: THROTTLE_LANE, label: '429 throttled' },
  ];

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Cold starts" value={sum.cold} sub={`${pct(sum.coldShare)} of served`} color={sum.cold > 0 ? 'var(--hi)' : undefined} />
          <Stat label="Throttled" value={sum.throttled} color={sum.throttled > 0 ? 'var(--bad)' : undefined} />
          <Stat label="p50 latency" value={sorted.length ? duration(percentile(sorted, 0.5)) : '–'} />
          <Stat label="p99 latency" value={sorted.length ? duration(percentile(sorted, 0.99)) : '–'}>
            <Sparkline values={sum.latencies.slice(-SPARK_CAP)} width={80} height={22} cap={SPARK_CAP} align="left" minMax={HANDLER_S * 2} color="var(--info)" strokeWidth={1.6} />
          </Stat>
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'provision sandbox' },
            { color: 'var(--amber)', label: 'start runtime' },
            { color: 'var(--violet)', label: 'function init' },
            { color: 'var(--info)', label: 'your handler' },
            { color: 'var(--ok)', label: 'warm, idle (hatched)' },
            { color: 'var(--bad)', label: 'throttled 429' },
            { color: 'var(--dim)', label: 'reaped' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="traffic" label="Traffic" inline>
          {PROFILES.map((p) => (
            <ChipButton key={p.value} tone="info" on={cfg.profile === p.value} onClick={() => set({ profile: p.value, peakRate: p.peakRate })}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Slider label="Peak rate" value={cfg.peakRate} min={1} max={12} onChange={(v) => set({ peakRate: v })} format={(v) => `${v}/s`} />
          <Slider label="Init work" value={Math.round(cfg.initS * 1000)} min={0} max={3000} step={100} onChange={(v) => set({ initS: v / 1000 })} format={(v) => duration(v / 1000)} />
          <Slider label="Idle reap" value={cfg.idleReap} min={2} max={30} onChange={(v) => set({ idleReap: v })} format={(v) => `${v} s`} />
        </>,
        <>
          <Slider
            label="Provisioned"
            value={cfg.provisioned}
            min={0}
            max={12}
            onChange={(v) => set({ provisioned: v })}
            format={(v) => (v > cfg.limit ? `${v} (capped at the limit, ${cfg.limit})` : String(v))}
          />
          <Slider label="Concurrency limit" value={cfg.limit} min={1} max={20} onChange={(v) => set({ limit: v })} />
        </>,
      ]}
    >
      <div className="sc stage-pad">
        <WideRegion minWidth={POOL_MIN_W} label="Function pool and instance timeline: scroll sideways to see all of it">
          <svg viewBox={`0 0 ${SCENE_W} ${sceneH}`} className="sc-scene" role="img" aria-label={`Function pool at ${now} seconds`}>
            <SceneNode at={sourceAt} w={84} h={50} title="requests" sub={`${cfg.profile} traffic`} />
            {slotsAt(run, now, slots).map((v) => {
              const at = nodeAt(v.slot);
              if (!v.state || !v.instance) {
                return <rect key={v.slot} className="sc-empty" x={at.x - NODE.w / 2} y={at.y - NODE.h / 2} width={NODE.w} height={NODE.h} rx={10} />;
              }
              const cold = v.state === 'provision' || v.state === 'runtime' || v.state === 'init';
              return (
                <SceneNode
                  key={v.slot}
                  at={at}
                  w={NODE.w}
                  h={NODE.h}
                  title={v.instance.provisioned ? `#${v.slot + 1} prov.` : `#${v.slot + 1}`}
                  sub={SLOT_SUB[v.state]}
                  tone={cold ? 'hi' : v.state === 'handler' ? 'info' : 'ok'}
                  on={v.state !== 'reaped'}
                  variant={v.state === 'reaped' ? 'dim' : 'default'}
                  titleDy={-4}
                  subDy={12}
                />
              );
            })}
            {fresh.slice(0, MAX_PACKETS).map((id, k) => {
              const r = run.requests[id];
              const throttled = r.outcome === 'throttled';
              const to = r.instance === null ? { x: GRID_X - NODE.w / 2 - 8, y: sourceAt.y } : nodeAt(run.instances[r.instance].slot);
              return (
                <Packet
                  key={`${player.index}-${id}`}
                  path={[{ x: SOURCE_X + 42, y: sourceAt.y }, to]}
                  label={throttled ? '429' : 'req'}
                  color={throttled ? 'var(--bad)' : 'var(--info)'}
                  arrive={throttled ? 'stay' : 'absorb'}
                  duration={0.5}
                  delay={0.05 * k}
                />
              );
            })}
          </svg>
          <GanttLanes
            lanes={lanes}
            bars={poolBars(run, now)}
            domain={[lo, hi]}
            now={now}
            axis
            unit=" s"
            size="md"
            labelWidth={96}
            labelMinPx={BAR_LABEL_PX}
            ariaLabel={`Instances over the last ${hi - lo} seconds`}
          />
        </WideRegion>
        <CostPanel run={run} costs={cost} />
        <Hint block>
          Simulated function platform; nothing touches a real account. Timings and prices are illustrative, not any provider's. Arrivals are a seeded random stream, so a run repeats
          exactly. Idle reap is compressed (real platforms keep an instance warm for minutes and don't promise how long). The timeline shows the last {hi - lo} seconds of the {HORIZON}-second
          run; one request per instance, no queue.
        </Hint>
      </div>
    </StageFrame>
  );
}

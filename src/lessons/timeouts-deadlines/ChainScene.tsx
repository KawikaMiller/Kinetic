import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { barLabelPx } from '../../core/gantt';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { decimal } from '../../core/format';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { chainBars } from './bars';
import { chainFrames } from './frames';
import {
  CALLERS, HOP_NAME, HOPS, NORMAL_DB, SLOW_DB, runChain, type CallerId, type ChainParams, type HopRun, type Outcome,
} from './model';

const STEP_MS = 1400;
/** Narrowest width where the four lanes and their bar labels stay readable. */
const GANTT_MIN_W = 520;
/** Narrowest width where the hop table's four columns fit without wrapping their chips. */
const TABLE_MIN_W = 460;
/** The remaining-budget bar turns orange under this share of the deadline. */
const LOW_BUDGET = 0.2;
const HONEST = 'Simulated services; every latency is illustrative. Propagation On assumes each hop honours the deadline and cancels its work, which every library has to support; Off is the usual case where a timed-out call leaves its callee running.';

const PRESETS: { id: string; label: string; timeouts: Record<CallerId, number> }[] = [
  { id: 'long', label: 'Long: 5 / 10 / 30 s', timeouts: { A: 5, B: 10, C: 30 } },
  { id: 'ordered', label: 'Ordered: 3 / 2 / 1 s', timeouts: { A: 3, B: 2, C: 1 } },
  { id: 'misordered', label: 'Misordered: 1.5 / 6 / 6 s', timeouts: { A: 1.5, B: 6, C: 6 } },
];

const DEFAULT_PARAMS: ChainParams = { patience: 2, timeouts: PRESETS[0].timeouts, dbLatency: SLOW_DB, queueB: 0, propagate: false };

const OUTCOME_TONE: Record<Outcome, Tone> = { ok: 'ok', timeout: 'bad', error: 'bad', deadline: 'orange', idle: 'dim' };
const CHIP_LABEL: Record<Outcome, string> = { ok: 'ok', timeout: 'timed out', error: 'error', deadline: 'deadline exceeded', idle: 'not called' };
const sec = (x: number) => `${decimal(x, 1)} s`;

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'work someone is waiting for' },
      { color: 'var(--bad)', label: 'work nobody is waiting for' },
      { color: 'var(--violet)', label: 'queue wait' },
      { color: 'var(--orange)', label: 'deadline exceeded (fail fast)' },
    ]}
  />
);

export function ChainScene({ picker }: { picker: ReactNode }) {
  const [params, setParams] = useState<ChainParams>(DEFAULT_PARAMS);
  const run = useMemo(() => runChain(params), [params]);
  const frames = useMemo(() => chainFrames(run), [run]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame.now;

  /** A changed setting shows its finished picture straight away; Restart replays it. */
  const change = (patch: Partial<ChainParams>) => {
    player.queueNext({ play: false, from: Number.MAX_SAFE_INTEGER });
    setParams((p) => ({ ...p, ...patch }));
  };
  const setTimeout_ = (id: CallerId, v: number) => change({ timeouts: { ...params.timeouts, [id]: v } });

  const horizon = Math.max(run.end, run.gaveUp) + 0.4;
  const bars = chainBars(run, now);
  const marker = params.propagate ? { label: 'deadline', tone: 'hi' as Tone } : { label: 'user gives up', tone: 'bad' as Tone };

  return (
    <StageFrame
      player={player}
      height={420}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="User sees" value={{ ok: 'a good answer', error: 'an error', 'gave-up': params.propagate ? 'nothing: deadline hit' : 'nothing: gave up' }[run.userSees]} color={run.userSees === 'ok' ? 'var(--ok)' : run.userSees === 'error' ? 'var(--bad)' : 'var(--orange)'} />
          <Stat label="Last hop stops" value={sec(run.end)} sub={`user waited ${sec(run.gaveUp)}`} />
          <Stat label="Work nobody waited for" value={sec(run.totalWasted)} color={run.totalWasted > 0 ? 'var(--bad)' : 'var(--ok)'} sub="summed over hops" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Deadline propagation" value={params.propagate} onChange={(propagate) => change({ propagate })} off="Off" on="On" />
          <Segmented
            label="Database"
            value={params.dbLatency === SLOW_DB ? 'slow' : 'normal'}
            onChange={(v) => change({ dbLatency: v === 'slow' ? SLOW_DB : NORMAL_DB })}
            options={[{ value: 'normal', label: `Normal (${NORMAL_DB * 1000} ms)` }, { value: 'slow', label: `Slow spike (${SLOW_DB} s)` }]}
          />
        </>,
        <ControlGroup key="presets" label="Timeouts" inline>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={CALLERS.every((c) => params.timeouts[c] === p.timeouts[c])} onClick={() => change({ timeouts: p.timeouts })}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Slider label="User waits" value={params.patience} min={0.5} max={5} step={0.1} onChange={(patience) => change({ patience })} format={sec} />
          {CALLERS.map((id) => (
            <Slider key={id} label={`${id}'s timeout`} value={params.timeouts[id]} min={0.5} max={30} step={0.5} onChange={(v) => setTimeout_(id, v)} format={sec} />
          ))}
          <Slider label="Queue at B" value={params.queueB} min={0} max={1.8} step={0.1} onChange={(queueB) => change({ queueB })} format={sec} />
        </>,
      ]}
    >
      <div className="stage-pad td">
        <WideRegion minWidth={GANTT_MIN_W} label="Call chain: scroll sideways to see all of it">
          <GanttLanes
            lanes={HOPS.map((id) => ({ id, label: HOP_NAME[id] }))}
            bars={bars}
            domain={[0, horizon]}
            now={now}
            markers={[{ at: run.gaveUp, label: marker.label, tone: marker.tone }]}
            unit=" s"
            axis
            size="md"
            labelWidth={72}
            labelMinPx={barLabelPx('deadline')}
            ariaLabel={`Call chain over ${sec(horizon)}`}
          />
        </WideRegion>
        <HopTable run={run.hops} now={now} propagate={params.propagate} patience={params.patience} timeouts={params.timeouts} dbLatency={params.dbLatency} />
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

function HopTable({ run, now, propagate, patience, timeouts, dbLatency }: {
  run: readonly HopRun[]; now: number; propagate: boolean; patience: number; timeouts: Record<CallerId, number>; dbLatency: number;
}) {
  return (
    <div className="td-table">
      <SectionTitle weight="regular" hint={propagate ? 'deadline minus elapsed, shrinking as the call goes down' : 'no budget is passed down'}>Each hop</SectionTitle>
      <WideRegion minWidth={TABLE_MIN_W} label="Hop table: scroll sideways to see all of it">
        <table className="data-table">
          <thead>
            <tr><th scope="col">Hop</th><th scope="col">Waits for downstream</th><th scope="col">Budget it was given</th><th scope="col">Now</th></tr>
          </thead>
          <tbody>
            {run.map((h) => (
              <tr key={h.id}>
                <th scope="row">{HOP_NAME[h.id]}</th>
                <td>{h.id === 'DB' ? `runs the query: ${decimal(dbLatency, 2)} s` : `up to ${sec(timeouts[h.id])}`}</td>
                <td className="td-budget">{budgetCell(h, now, propagate, patience)}</td>
                <td>{statusChip(h, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </WideRegion>
    </div>
  );
}

function budgetCell(h: HopRun, now: number, propagate: boolean, patience: number): ReactNode {
  if (!propagate) return <span className="td-faint">not passed</span>;
  if (!h.reached || now < h.start) return <span className="td-faint">–</span>;
  const left = Math.max(0, h.budget ?? 0);
  return (
    <Bar
      value={left}
      max={patience}
      tone={left / patience < LOW_BUDGET ? 'orange' : 'ok'}
      height={6}
      trailing={<span className="td-budget-text">{decimal(left, 2)} s left</span>}
    />
  );
}

function statusChip(h: HopRun, now: number): ReactNode {
  if (!h.reached) return <span className="chip tone-dim">not called</span>;
  if (now < h.start) return <span className="td-faint">–</span>;
  if (now < h.finish) return <span className="chip tone-info">working</span>;
  return <span className={`chip tone-${OUTCOME_TONE[h.outcome]}`}>{h.refused ? 'refused: no budget' : CHIP_LABEL[h.outcome]}</span>;
}

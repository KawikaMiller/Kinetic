import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points } from '../../components/Plot2D';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { DRIFT_PPM_MAX, MS_PER_SECOND, OFFSET_MS_MAX, PATH_MS_MAX, type SyncMode } from './clocks';
import { SYNC_LABEL, driftCaption, exchangeCaption } from './captions';
import { BAD_CLOCKS, DEFAULT_DRIFT, GOOD_CLOCKS, NODE_NAMES, POLL_EXP, driftView, pollSecondsOf, type DriftState } from './drift';
import { absTimeText, signedMs, timeText } from './format';

const NODE_TONES: readonly Tone[] = ['amber', 'pink', 'sky', 'orange', 'muted'];
const SYNC_OPTIONS = (['off', 'step', 'slew'] as const).map((m) => ({ value: m, label: SYNC_LABEL[m] }));
const NODE_OPTIONS = NODE_NAMES.map((n, i) => ({ value: i, label: n }));
const Y_HEADROOM = 1.15;
const MIN_Y_MS = 10;
const PLOT_W = { wide: 600, narrow: 356 } as const;

/** A time axis in the biggest sensible unit for the window. */
function timeAxis(horizonMs: number): { unit: string; per: number } {
  if (horizonMs >= 2 * 3_600_000) return { unit: 'hours', per: 3_600_000 };
  if (horizonMs >= 2 * 60_000) return { unit: 'minutes', per: 60_000 };
  return { unit: 'seconds', per: MS_PER_SECOND };
}

export function DriftScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<DriftState>(DEFAULT_DRIFT);
  const narrow = useMediaQuery(PHONE_QUERY);
  const v = useMemo(() => driftView(s), [s]);
  const axis = timeAxis(v.horizonMs);
  const poll = pollSecondsOf(s);
  const set = (patch: Partial<DriftState>) => setS((old) => ({ ...old, ...patch }));
  const setClock = (patch: Partial<{ offsetMs: number; driftPpm: number }>) =>
    set({ clocks: s.clocks.map((c, i) => (i === s.node ? { ...c, ...patch } : c)) });
  const top = Math.max(MIN_Y_MS, ...v.series.flat().map((p) => Math.abs(p.skew))) * Y_HEADROOM;
  const sync = s.mode !== 'off';

  useIntroCaption(
    <>
      {driftCaption(s, v)} {exchangeCaption(v, s.forwardMs, s.returnMs)}
    </>,
    [s],
  );

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label={`${NODE_NAMES[s.node]} drift`} value={`${v.clock.driftPpm} ppm`} sub={`${signedMs(v.perDayMs)} a day`} />
          <Stat
            label={sync ? 'Worst error (second half)' : 'Skew at the end'}
            value={sync ? absTimeText(v.worst) : timeText(v.series[s.node].at(-1)!.skew)}
            sub={sync ? `drift × poll = ${absTimeText(v.driftTimesPollMs)}` : `after ${v.horizonMs / 3_600_000} hours, ${NODE_NAMES[s.node]}`}
          />
          <Stat label="Estimate error" value={signedMs(v.exchangeError)} sub={`(forward − return) / 2 = ${signedMs(v.asymmetryMs)}`} />
          {v.demo && (
            <Stat
              label="Wall clock across the first correction"
              value={`${v.demo.moved < 0 ? '−' : '+'}${timeText(Math.abs(v.demo.moved))}`}
              color={v.demo.moved < 0 ? 'var(--bad)' : undefined}
              sub={[v.demo.moved < 0 ? 'it went backwards' : 'it moved forward', `a monotonic clock: +${timeText(v.demo.monotonicAdvance)}`]}
            />
          )}
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...NODE_NAMES.map((n, i) => ({ color: `var(--${i === s.node ? 'info' : NODE_TONES[i]})`, label: i === s.node ? `${n} (selected)` : n })),
            { color: 'var(--dim)', label: 'true time', shape: 'line' as const },
            { color: 'var(--hi)', label: 'a sync step', shape: 'dot' as const },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Node" value={s.node} onChange={(node) => set({ node })} options={NODE_OPTIONS} />
          <ControlGroup label="Presets" inline>
            <ChipButton tone="info" size="md" on={s.clocks === GOOD_CLOCKS} onClick={() => set({ clocks: GOOD_CLOCKS })}>a good oscillator</ChipButton>
            <ChipButton tone="info" size="md" on={s.clocks === BAD_CLOCKS} onClick={() => set({ clocks: BAD_CLOCKS })}>a bad one</ChipButton>
          </ControlGroup>
        </>,
        <>
          <Slider label={`${NODE_NAMES[s.node]} drift`} value={v.clock.driftPpm} min={-DRIFT_PPM_MAX} max={DRIFT_PPM_MAX} format={(x) => `${x} ppm`} onChange={(driftPpm) => setClock({ driftPpm })} />
          <Slider label={`${NODE_NAMES[s.node]} offset`} value={v.clock.offsetMs} min={-OFFSET_MS_MAX} max={OFFSET_MS_MAX} step={10} format={(x) => `${x} ms`} onChange={(offsetMs) => setClock({ offsetMs })} />
        </>,
        <>
          <Segmented label="Sync" value={s.mode} onChange={(mode: SyncMode) => set({ mode })} options={SYNC_OPTIONS} />
          {sync && <Slider label="Poll every" value={s.pollExp} min={POLL_EXP.min} max={POLL_EXP.max} format={() => `${poll} s`} onChange={(pollExp) => set({ pollExp })} />}
        </>,
        <>
          <Slider label="Forward delay" value={s.forwardMs} min={0} max={PATH_MS_MAX} format={(x) => `${x} ms`} onChange={(forwardMs) => set({ forwardMs })} />
          <Slider label="Return delay" value={s.returnMs} min={0} max={PATH_MS_MAX} format={(x) => `${x} ms`} onChange={(returnMs) => set({ returnMs })} />
        </>,
      ]}
    >
      <div className="pc-stage stage-pad">
        <Plot2D
          width={narrow ? PLOT_W.narrow : PLOT_W.wide}
          x={{ domain: [0, v.horizonMs / axis.per], label: `true time (${axis.unit})`, ticks: 6 }}
          y={{ domain: [-top, top], label: 'skew (ms)', ticks: 5 }}
          ariaLabel="Skew of each node's clock against true time"
        >
          <HLine at={0} tone="dim" label="true time" />
          {v.series.map((series, i) =>
            i === s.node ? null : <Curve key={i} tone={NODE_TONES[i]} points={series.map((p) => [p.t / axis.per, p.skew])} />,
          )}
          <Curve tone="info" width={2.5} points={v.series[s.node].map((p) => [p.t / axis.per, p.skew])} />
          {v.corrections.length > 0 && <Points tone="hi" r={3.5} data={v.corrections.map((p) => ({ x: p.t / axis.per, y: p.skew }))} />}
        </Plot2D>
        <Box>
          <SectionTitle hint={`${NODE_NAMES[s.node]} asks the time server, with the path delays above`}>One NTP exchange, on real messages</SectionTitle>
          <SequenceDiagram
            actors={[{ id: 'client', label: NODE_NAMES[s.node] }, { id: 'server', label: 'time server' }]}
            messages={[
              { id: 'q', from: 'client', to: 'server', label: 'request', note: `t0 = ${v.exchange.t0.toFixed(1)} ms (client), t1 = ${v.exchange.t1.toFixed(1)} ms (server)` },
              { id: 'r', from: 'server', to: 'client', label: 'reply', note: `t2 = ${v.exchange.t2.toFixed(1)} ms (server), t3 = ${v.exchange.t3.toFixed(1)} ms (client)` },
            ]}
            ariaLabel="NTP four-timestamp exchange"
          />
        </Box>
        {v.demo && (
          <Hint tone="muted">
            A program reading the wall clock sees {s.mode === 'step' ? 'the step as a jump' : 'only a change of rate'}: it read {v.demo.before.toFixed(1)} ms, then {v.demo.after.toFixed(1)} ms one millisecond of true time later. A monotonic clock, used for durations, is never stepped: here it advanced {timeText(v.demo.monotonicAdvance)} either way (a real one can still be slewed by a small rate, as on Linux).
          </Hint>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated">the exchange runs on the distSim harness; the sawtooth is the same arithmetic over time, checked against it in the tests</Provenance>
          <Provenance kind="illustrative">drifts, offsets, path delays and the slew rate are made up; ordinary quartz clocks drift tens of ppm, from memory, check a datasheet</Provenance>
          <Provenance kind="from-memory">the formulas are those of the NTP specification, RFC 5905; real clients filter many samples from several servers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { plainTone, toneVar } from '../../core/tone';
import { verdictWords } from './captions';
import { buildRun } from './frames';
import { BROKEN_SEED } from './pins';
import { DEFAULT_OPTIONS, NAMES, RATES, TIME_MS, type Method, type Name, type Rate, type SimOptions } from './sim';
import { TOTAL_TOKENS, recordedTotals } from './snapshot';

const METHODS = [
  { value: 'markers' as const, label: 'Markers (Chandy-Lamport)' },
  { value: 'naive' as const, label: 'Everyone records at a chosen time' },
];
const RATE_OPTIONS = (Object.keys(RATES) as Rate[]).map((value) => ({ value, label: RATES[value].label }));
const INITIATORS = NAMES.map((n) => ({ value: n, label: n }));
const PLAYER_INTERVAL_MS = 220;

export function PhotoScene({ picker }: { picker: ReactNode }) {
  const [options, setOptions] = useState<SimOptions>(DEFAULT_OPTIONS);
  const [seed, setSeed] = useState(1);
  const change = (patch: Partial<SimOptions>) => setOptions({ ...options, ...patch });
  const run = useMemo(() => buildRun(options, seed), [options, seed]);
  const player = usePlayer(run.frames, { interval: PLAYER_INTERVAL_MS, autoplayOnChange: false });
  const frame = player.frame;
  const live = recordedTotals(frame.procs);
  const liveTotal = options.method === 'markers' ? live.total : live.states;
  const atEnd = player.atEnd;

  return (
    <StageFrame
      height={500}
      player={player}
      stats={
        <Stats>
          <Stat label="Recorded total" value={frame.procs.every((p) => p.recorded === null) ? '–' : `${liveTotal} of ${TOTAL_TOKENS}`} color={frame.finished ? (liveTotal === TOTAL_TOKENS ? 'var(--ok)' : 'var(--bad)') : undefined} sub={frame.finished ? `difference ${liveTotal - TOTAL_TOKENS}` : 'while it is still being recorded'} />
          <Stat label="Conservation" value={!atEnd ? '–' : run.result.finished ? (run.result.conservation ? 'holds' : 'broken') : 'unfinished'} color={!atEnd || !run.result.finished ? undefined : run.result.conservation ? 'var(--ok)' : 'var(--bad)'} sub="states plus channel contents equal 300" />
          <Stat label="Closure" value={!atEnd ? '–' : run.result.closure.closed ? 'holds' : 'broken'} color={!atEnd ? undefined : run.result.closure.closed ? 'var(--ok)' : 'var(--bad)'} sub="computed from vector clocks over the trace" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a token in flight' },
            { color: 'var(--violet)', label: 'a marker' },
            { color: 'var(--hi)', label: 'a recorded process state' },
            { color: 'var(--ok)', label: 'a consistent verdict' },
            { color: 'var(--bad)', label: 'a lost or double-counted amount, an offending message' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Method" options={METHODS} value={options.method} onChange={(method: Method) => change({ method })} />
          <Segmented label="Transfers" options={RATE_OPTIONS} value={options.rate} onChange={(rate) => change({ rate })} />
          <Toggle label="FIFO channels" value={options.fifo} onChange={(fifo) => change({ fifo })} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        options.method === 'markers' ? (
          <>
            <Segmented label="Initiator" options={INITIATORS} value={options.initiator} onChange={(initiator: Name) => change({ initiator })} />
            <Slider label="Starts at" value={options.startMs} min={TIME_MS.min} max={TIME_MS.max} format={(v) => `${v} ms`} onChange={(startMs) => change({ startMs })} />
          </>
        ) : (
          <>
            {NAMES.map((n, i) => (
              <Slider key={n} label={`${n} records at`} value={options.recordMs[i]} min={TIME_MS.min} max={TIME_MS.max} format={(v) => `${v} ms`} onChange={(v) => change({ recordMs: options.recordMs.map((x, k) => (k === i ? v : x)) as unknown as SimOptions['recordMs'] })} />
            ))}
          </>
        ),
      ]}
    >
      <div className="ds-stage stage-pad">
        <div className="ds-procs">
          {NAMES.map((n, i) => {
            const p = frame.procs[i];
            return (
              <Box key={n} className="ds-proc" style={{ '--c': toneVar(plainTone(i)) } as CSSProperties}>
                <SectionTitle hint={p.recorded === null ? undefined : 'has recorded'}>{n}</SectionTitle>
                <div className="ds-balance mono">{p.tokens}</div>
                <div className="ds-line">tokens held</div>
                {p.recorded !== null && <div className="ds-ghost is-state">recorded {p.recorded}</div>}
                {options.method === 'markers' && p.recorded !== null && Object.entries(p.channels).map(([from, c]) => (
                  <div key={from} className={`ds-ghost is-channel ${c.status === 'done' ? '' : 'is-open'}`}>
                    from {from}: {c.status === 'done' ? `${c.sum} recorded` : c.status === 'recording' ? `recording ${c.sum}` : 'waiting'}
                  </div>
                ))}
              </Box>
            );
          })}
        </div>
        <Box>
          <SectionTitle hint="what is on the wire right now">Channels</SectionTitle>
          <div className="ds-channels">
            {NAMES.flatMap((from) => NAMES.filter((to) => to !== from).map((to) => {
              const items = frame.inflight.filter((m) => m.from === from && m.to === to);
              return (
                <div key={`${from}${to}`} className="ds-channel">
                  <span className="ds-channel-name mono">{from} to {to}</span>
                  {items.length === 0 ? <span className="ds-empty">empty</span> : items.map((m) => <span key={m.id} className={`chip ${m.kind === 'marker' ? 'tone-violet' : 'tone-info'}`}>{m.kind === 'marker' ? 'marker' : m.amount}</span>)}
                </div>
              );
            }))}
          </div>
        </Box>
        {atEnd && <Hint block>{verdictWords(run.result)}</Hint>}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>three processes on distSim with random transfers of 1 to 10 tokens</Provenance>
          <Provenance kind="illustrative">token counts, rates and delays are made up</Provenance>
          <Provenance kind="from-memory">Chandy and Lamport, Distributed Snapshots (1985); check the title and year</Provenance>
          <ClaimLabel kind="practice">stable-property detection, such as termination and deadlock, is the classic use</ClaimLabel>
        </ProvenanceRow>
        {seed === BROKEN_SEED && !options.fifo && options.method === 'markers' && <Hint block>This is the pinned failing seed for markers on non-FIFO channels.</Hint>}
      </div>
    </StageFrame>
  );
}

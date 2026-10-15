import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar, type GanttLane } from '../../components/GanttLanes';
import { MetricMeter } from '../../components/MetricMeter';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { barsAt } from '../../core/gantt';
import { usePlayer } from '../../core/usePlayer';
import { generatorFrames, msText, timelineEnd, timelineStart } from './frames';
import {
  GENERATORS, GENERATOR_DEFAULT, GENERATOR_NAME, RATE_RANGE, SLO_P99_MS, STALL_AT_RANGE, STALL_MS_RANGE, hidesStall, readGenerator, timelineRange, type Generator,
} from './model';
import { pctText } from '../../core/format';

const STEP_MS = 420;
const METER_MAX = 1200;
const MIN_BAR_PX = 3;
const GENERATOR_OPTIONS = GENERATORS.map((g) => ({ value: g, label: GENERATOR_NAME[g] }));
/** A late-sent request waited at least this long (ms) for its send: the wait the closed-loop tool never records. */
const OMITTED_MIN_MS = 0.5;

export function OmissionScene({ picker }: { picker: ReactNode }) {
  const [generator, setGenerator] = useState<Generator>(GENERATOR_DEFAULT.generator);
  const [rate, setRate] = useState<number>(GENERATOR_DEFAULT.rate);
  const [stallMs, setStallMs] = useState<number>(GENERATOR_DEFAULT.stallMs);
  const [stallAt, setStallAt] = useState<number>(GENERATOR_DEFAULT.stallAt);
  const params = useMemo(() => ({ rate, stallMs, stallAt }), [rate, stallMs, stallAt]);
  const reading = useMemo(() => readGenerator(generator, params), [generator, params]);
  const all = useMemo(() => GENERATORS.map((g) => readGenerator(g, params)), [params]);
  const frames = useMemo(() => generatorFrames(reading, params), [reading, params]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame.now;

  const { schedule } = reading;
  const [first, last] = timelineRange(schedule);
  const t0 = timelineStart(reading);
  const end = timelineEnd(reading);
  const lanes: GanttLane[] = Array.from({ length: last - first + 1 }, (_, i) => ({ id: `q${first + i}`, label: `request ${first + i}${first + i === schedule.stalled ? ' (stalls)' : ''}` }));
  const planned: GanttBar[] = lanes.flatMap((lane, i): GanttBar[] => {
    const k = first + i;
    const due = schedule.intended[k] - t0;
    const sent = schedule.sent[k] - t0;
    const done = schedule.done[k] - t0;
    return [
      { id: `due${k}`, lane: lane.id, start: due, end: due, tone: 'info', label: `request ${k} due` },
      ...(sent - due > OMITTED_MIN_MS ? [{ id: `wait${k}`, lane: lane.id, start: due, end: sent, tone: 'dim' as const, kind: 'blocked' as const, label: `request ${k} not yet sent: not recorded` }] : []),
      { id: `run${k}`, lane: lane.id, start: sent, end: done, tone: 'violet', minPx: MIN_BAR_PX, label: `request ${k} in flight` },
    ];
  });
  const lies = hidesStall(reading);
  const closed = all.find((r) => r.kind === 'closed')!;
  const lateCount = closed.schedule.sent.filter((sent, k) => sent - closed.schedule.intended[k] > OMITTED_MIN_MS).length;

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Requests" value={schedule.intended.length.toLocaleString('en-US')} sub={[`one every ${msText(schedule.interval)}`, `${reading.recorded.length.toLocaleString('en-US')} samples recorded`]} />
          <Stat label="p99 the tool reports" value={msText(reading.reportedP99)} color={lies ? 'var(--bad)' : reading.kind === 'corrected' ? 'var(--ok)' : 'var(--info)'} sub={[GENERATOR_NAME[generator]]} />
          <Stat label="p99 users saw" value={msText(reading.trueP99)} color={reading.trueP99 > SLO_P99_MS ? 'var(--bad)' : 'var(--ok)'} sub={['from when each request was due', `${pctText(reading.overSlo, 0)} of requests over ${SLO_P99_MS} ms`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'when a request was due' },
            { color: 'var(--violet)', label: 'in flight (recorded)' },
            { color: 'var(--dim)', label: 'due but not sent (hollow, not recorded)' },
            { color: 'var(--bad)', label: 'a p99 that hides the stall' },
            { color: 'var(--ok)', label: 'the corrected or true p99' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Load generator" value={generator} onChange={setGenerator} options={GENERATOR_OPTIONS} />
        </>,
        <>
          <Slider label="Rate" value={rate} {...RATE_RANGE} format={(v) => `${v}/s`} onChange={setRate} />
          <Slider label="Stall length" value={stallMs} {...STALL_MS_RANGE} format={(v) => (v === 0 ? 'no stall' : msText(v))} onChange={setStallMs} />
          <Slider label="Stall at" value={stallAt} {...STALL_AT_RANGE} format={(v) => `${v} s`} onChange={setStallAt} />
        </>,
      ]}
    >
      <div className="bm-stage stage-pad">
        <Box className="bm-lanes">
          <SectionTitle hint={`the requests around the stall, ms after request ${first} was due`}>Due, sent and replied</SectionTitle>
          <WideRegion minWidth={520} label="Request timeline: scroll sideways to see all of it">
            <GanttLanes
              lanes={lanes}
              bars={barsAt(planned, now)}
              domain={[0, end]}
              now={now}
              unit=" ms"
              axis
              size="sm"
              labelWidth={116}
              labelMinPx={Number.POSITIVE_INFINITY}
              ariaLabel={`${GENERATOR_NAME[generator]} generator: requests ${first} to ${last}`}
            />
          </WideRegion>
        </Box>
        <div className="bm-meters">
          <MetricMeter
            label={`What the tool reports, against ${SLO_P99_MS} ms`}
            value={reading.reportedP99}
            max={METER_MAX}
            format={msText}
            bands={[
              { upTo: SLO_P99_MS, tone: lies ? 'bad' : 'ok', label: lies ? 'within, and hiding the stall' : 'within the objective', tick: { label: `${SLO_P99_MS} ms`, tone: 'dim' } },
              { upTo: METER_MAX, tone: 'orange', label: 'over the objective' },
            ]}
          />
          <MetricMeter
            label={`What users saw, against ${SLO_P99_MS} ms`}
            value={reading.trueP99}
            max={METER_MAX}
            format={msText}
            bands={[
              { upTo: SLO_P99_MS, tone: 'ok', label: 'within the objective', tick: { label: `${SLO_P99_MS} ms`, tone: 'dim' } },
              { upTo: METER_MAX, tone: 'bad', label: 'over the objective' },
            ]}
          />
        </div>
        <Box className="bm-table-box">
          <SectionTitle hint="same stall, three tools">What each generator reports</SectionTitle>
          <table className="data-table bm-table">
            <thead>
              <tr>
                <th>generator</th>
                <th>reports p99</th>
                <th>users saw p99</th>
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr key={r.kind} className={r.kind === generator ? 'bm-picked' : ''}>
                  <th scope="row">{GENERATOR_NAME[r.kind]}</th>
                  <td className={hidesStall(r) ? 'bm-bad' : ''}>{msText(r.reportedP99)}</td>
                  <td>{msText(r.trueP99)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">a made-up server (one request at a time, {GENERATOR_DEFAULT.stallMs} ms stall by default); no randomness, so no seed</Provenance>
          <Provenance kind="from-memory">the backfill is the correction HdrHistogram-style recorders apply for an expected interval: verify against its documentation</Provenance>
        </ProvenanceRow>
        <Hint tone="muted" className="bm-note">
          Closed-loop tools wait for each reply before sending the next request, so a stall delays the whole schedule and the requests that should have gone out during it are silently
          missing: one slow sample is recorded, and the {lateCount} requests that went out late after it are recorded as fast. The correction adds the missing samples back. The runs are 10 seconds
          at up to 500 requests a second against a server that takes 1 ms a request, so there are at most 5,000 requests.
        </Hint>
      </div>
    </StageFrame>
  );
}

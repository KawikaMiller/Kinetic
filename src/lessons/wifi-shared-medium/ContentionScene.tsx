import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { pct } from '../../core/format';
import { createTickSim } from '../../core/simTick';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { contentionFrames } from './captions';
import { CW_MAX, CW_MIN, DCF_TICKS, STATIONS_RANGE, airtimeShare, analysisAirtime, analysisCollision, collisionShare, initDcf, meanCw, slotEvents, stepDcf, type DcfState } from './dcf';
import { initialContention, type ContentionState } from './init';

const GANTT_MIN_WIDTH = 480;
/** Station identity: plain tones, repeating, never a verdict colour. */
const STATION_TONES: readonly Tone[] = ['amber', 'pink', 'sky', 'orange'];

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a frame that got through (a success)' },
      { color: 'var(--bad)', label: 'a collision: two or more sent at once' },
      { color: 'var(--info)', label: 'a station counting down (hatched)' },
    ]}
  />
);

export function ContentionScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<ContentionState>(initialContention);
  const history = useMemo(() => {
    const sim = createTickSim<DcfState>({ seed: st.seed, init: (rnd) => initDcf(st.stations, rnd), step: (s, rnd) => stepDcf(s, rnd) });
    sim.run(DCF_TICKS);
    return sim.history;
  }, [st]);
  const frames = useMemo(() => contentionFrames(history, st.stations), [history, st.stations]);
  const player = usePlayer(frames, { interval: 120, autoplay: true });
  const tick = Math.min(DCF_TICKS, Math.round(player.frame.now));
  const state = history[tick];
  const events = useMemo(() => slotEvents(history), [history]);
  const total = history[history.length - 1].time;
  const lanes = useMemo(() => Array.from({ length: st.stations }, (_, i) => ({ id: String(i), label: `S${i + 1}` })), [st.stations]);
  const bars: GanttBar[] = useMemo(() => {
    const out: GanttBar[] = [];
    const upTo = events.filter((e) => e.tick <= tick);
    const now = state.time;
    for (let i = 0; i < st.stations; i++) {
      let cursor = 0;
      for (const e of upTo) {
        if (!e.senders.includes(i)) continue;
        if (e.start > cursor) out.push({ id: `${i}w${e.tick}`, lane: String(i), start: cursor, end: e.start, tone: 'info', kind: 'wait' });
        out.push({ id: `${i}s${e.tick}`, lane: String(i), start: e.start, end: e.end, tone: e.kind === 'success' ? 'ok' : 'bad' });
        cursor = e.end;
      }
      if (now > cursor) out.push({ id: `${i}w-end`, lane: String(i), start: cursor, end: now, tone: 'info', kind: 'wait' });
    }
    return out;
  }, [events, tick, state.time, st.stations]);
  const maxWins = Math.max(1, ...state.stations.map((s) => s.successes));
  const coll = collisionShare(state);
  const air = airtimeShare(state);

  return (
    <StageFrame
      height={720}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Attempts that collided" value={coll === null ? '–' : pct(coll)} color={coll !== null && coll > 0.3 ? 'var(--bad)' : undefined} sub={[`after ${tick} slots`, `long-run analysis: ${pct(analysisCollision(st.stations))}`]} />
          <Stat label="Airtime that carried a frame" value={air === null ? '–' : pct(air)} sub={[`after ${tick} slots`, `long-run analysis: ${pct(analysisAirtime(st.stations))}`]} />
          <Stat label="Mean contention window" value={meanCw(state).toFixed(0)} sub={`starts at ${CW_MIN}, tops out at ${CW_MAX}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Stations" value={st.stations} min={STATIONS_RANGE.min} max={STATIONS_RANGE.max} onChange={(stations) => setSt((s) => ({ ...s, stations }))} />
        </>,
        <>
          <SeedField seed={st.seed} onSeed={(seed) => setSt((s) => ({ ...s, seed }))} />
          <Button onClick={() => setSt(initialContention())}>Reset</Button>
        </>,
      ]}
    >
      <div className="wf-stage stage-pad">
        <Box>
          <SectionTitle hint="time in idle-slot units; a frame takes 20 of them (illustrative)">Who sends when, {st.stations} saturated stations</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Timeline of every station: scroll sideways to see all of it">
            <GanttLanes lanes={lanes} bars={bars} domain={[0, total]} now={state.time} unit="" axis size="sm" labelWidth={40} ariaLabel="Frames sent by each station over the virtual slots" />
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="frames each station got through so far">Fairness</SectionTitle>
          <div className="wf-bars">
            {state.stations.map((s, i) => (
              <div key={i} className="wf-bar-row">
                <span className="wf-bar-name">S{i + 1}</span>
                <Bar value={s.successes} max={maxWins} tone={STATION_TONES[i % STATION_TONES.length]} ariaLabel={`Station ${i + 1}: ${s.successes} frames through`} />
                <span className="wf-bar-text">{s.successes}</span>
              </div>
            ))}
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={st.seed}>saturated stations on virtual slots; the long-run analysis is Bianchi's fixed point (2000), computed here</Provenance>
          <Provenance kind="from-memory">window 15 up to 1023, the OFDM defaults of IEEE 802.11 (verify; EDCA access categories use other values)</Provenance>
          <Provenance kind="illustrative">abstract slots: real timing has SIFS, DIFS, preambles and ACKs; a frame is 20 idle slots here</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

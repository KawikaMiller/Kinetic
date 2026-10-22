import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { plainTone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { ALGOS, TRACES, bufferAt, simulate, traceOf, type AlgoId } from './abr';
import { playFrames } from './captions';
import { timeDomain, useChartWidth } from './chartMath';
import { BufferPlot, ThroughputPlot } from './charts';
import { initialPlayer } from './init';
import { TraceControls } from './TraceControls';

const LANES = [
  { id: 'download', label: 'download' },
  { id: 'playback', label: 'playback' },
  { id: 'stall', label: 'stall' },
];
const ALGO_OPTIONS = ALGOS.map((a) => ({ value: a.id, label: a.label }));
const GANTT_MIN_WIDTH = 480;

/** What has happened by `now`: bars still running are cut at `now`, and nothing ahead of it is drawn (no ghost of the future). */
const happened = (bars: GanttBar[], now: number): GanttBar[] => bars.flatMap((b) => (b.start >= now ? [] : [{ ...b, end: Math.min(b.end, now) }]));

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'the buffer: seconds already downloaded' },
      { color: 'var(--bad)', label: 'a stall: the buffer ran dry' },
      { color: 'var(--hi)', label: 'the segment just downloaded, and the bitrate it was fetched at' },
      { color: 'var(--dim)', label: 'the network throughput' },
      { color: 'var(--muted)', label: 'playback' },
      { color: 'var(--amber)', label: 'a rendition: its number r1 to r5 is in the bar' },
    ]}
  />
);

export function PlayerScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialPlayer);
  const trace = useMemo(() => traceOf(st.trace, st.seed), [st.trace, st.seed]);
  const run = useMemo(() => simulate(trace, st.S, st.algo), [trace, st.S, st.algo]);
  const frames = useMemo(() => playFrames(run, st.algo), [run, st.algo]);
  const player = usePlayer(frames, { interval: 1100, autoplay: true });
  const { k, now } = player.frame;
  const width = useChartWidth();
  const domain = timeDomain(run);
  const traceNote = TRACES.find((t) => t.id === st.trace)?.note;

  const bars = useMemo<GanttBar[]>(() => {
    const out: GanttBar[] = run.segs.map((s) => ({ id: `d${s.index}`, lane: 'download', start: s.start, end: s.end, tone: plainTone(s.rendition), label: `r${s.rendition + 1}`, ring: s.index === k ? 'hi' : undefined }));
    // playback runs from the startup to the end, with a gap for each stall
    let from = run.startup;
    for (const s of run.segs) {
      if (s.stall > 0) {
        out.push({ id: `p${s.index}`, lane: 'playback', start: from, end: s.end - s.stall, tone: 'muted' });
        out.push({ id: `s${s.index}`, lane: 'stall', start: s.end - s.stall, end: s.end, tone: 'bad', label: 'stall' });
        from = s.end;
      }
    }
    if (run.wall !== null) out.push({ id: 'p-last', lane: 'playback', start: from, end: run.wall, tone: 'muted' });
    return out;
  }, [run, k]);

  const sofar = run.segs.filter((s) => s.end <= now);
  const stallSoFar = sofar.reduce((n, s) => n + s.stall, 0);

  return (
    <StageFrame
      height={760}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Startup delay" value={run.segs.length ? `${run.startup.toFixed(1)} s` : 'never'} sub="until the first segment lands" />
          <Stat label="Stalled so far" value={`${stallSoFar.toFixed(1)} s`} color={stallSoFar > 0 ? 'var(--bad)' : undefined} sub={`${sofar.filter((s) => s.stall > 0).length} stall${sofar.filter((s) => s.stall > 0).length === 1 ? '' : 's'}`} />
          <Stat label="Buffer now" value={`${bufferAt(run, now).toFixed(1)} s`} color="var(--info)" sub="seconds of video ready" />
          <Stat label="Segments" value={`${sofar.length} of ${run.count}`} sub={run.stuckAt !== null ? 'stalled, no data arriving' : `${run.switches} switches in the whole run`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented<AlgoId> label="Player" value={st.algo} options={ALGO_OPTIONS} onChange={(algo) => setSt((s) => ({ ...s, algo }))} />
        </>,
        <TraceControls key="trace" trace={st.trace} seed={st.seed} S={st.S} onTrace={(trace2) => setSt((s) => ({ ...s, trace: trace2 }))} onSeed={(seed) => setSt((s) => ({ ...s, seed }))} onSegment={(S) => setSt((s) => ({ ...s, S }))} />,
      ]}
    >
      <div className="abr-stage stage-pad">
        <Box>
          <SectionTitle hint={traceNote}>The network and what the player asks for</SectionTitle>
          <ThroughputPlot trace={trace} run={run} domain={domain} now={now} width={width} />
        </Box>
        <Box>
          <SectionTitle hint="the buffer fills as segments land and drains in real time">The playback buffer</SectionTitle>
          <BufferPlot run={run} domain={domain} now={now} width={width} />
        </Box>
        <Box>
          <SectionTitle hint="download bars carry their rendition number">Downloads, playback and stalls</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Timeline of downloads, playback and stalls: scroll sideways to see all of it">
            <GanttLanes lanes={LANES} bars={happened(bars, now)} domain={[0, domain]} now={Math.min(now, domain)} axis unit=" s" size="md" labelWidth={84} labelMinPx={22} ariaLabel="Timeline of segment downloads, playback and stalls" />
          </WideRegion>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">the player, the buffer and the downloads are computed event by event from the trace</Provenance>
          <Provenance kind="illustrative">the five-rung ladder (0.4 to 5 Mbit/s), the traces and the 30 s buffer cap are made up; HLS segment lengths and ladders vary by service, and this is a model</Provenance>
          {st.algo === 'buffer' && <Provenance kind="from-memory">the buffer-based rule follows the idea of Huang and others (2014), simplified: verify against the paper</Provenance>}
          {st.trace === 'random' && <Provenance kind="simulated" seed={st.seed}>random-walk trace</Provenance>}
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

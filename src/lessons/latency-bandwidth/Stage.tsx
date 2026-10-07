import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, PauseButton, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { useCanvas, useLoop } from '../../core/hooks';
import { useSimulation } from '../../core/useSimulation';
import { drawPipe } from './draw';
import { chattyCaption, pipeCaption, shareText, transferCaption } from './frames';
import {
  BANDWIDTH_STOPS, CHATTY_CALLS, CHATTY_EACH, NEW_CONNECTION_RTTS, PRESETS, RTT_STOPS, SIZES, WINDOW_STOPS, bdp, blocksInFlight, chattyVsBatched,
  createPipe, nearestStop, rateText, sizeText, stepPipe, throughput, timeText, transferTime, windowLimited, type Link,
} from './model';
import './styles.css';

type SceneId = 'pipe' | 'transfer' | 'chatty';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'pipe', label: 'The pipe' },
  { value: 'transfer', label: 'Transfer time' },
  { value: 'chatty', label: 'Chatty vs batched' },
];
const HONEST = 'Idealised link: no loss, no congestion control, a fixed window. Every number is computed from the sliders.';
const DEFAULT = { rtt: nearestStop(RTT_STOPS, 0.08), bw: nearestStop(BANDWIDTH_STOPS, 1e9), win: nearestStop(WINDOW_STOPS, 5e6) };

interface LinkControls {
  link: Link;
  controls: ReactNode[];
}

/** The link's sliders and presets, shared by every scene so a preset survives a scene switch. */
function useLink(picker: ReactNode, idx: typeof DEFAULT, setIdx: (i: typeof DEFAULT) => void, withWindow = true): LinkControls {
  const link: Link = { rtt: RTT_STOPS[idx.rtt], bandwidth: BANDWIDTH_STOPS[idx.bw], window: WINDOW_STOPS[idx.win] };
  const active = PRESETS.find((p) => p.rtt === link.rtt && p.bandwidth === link.bandwidth)?.id;
  return {
    link,
    controls: [
      <>
        {picker}
        <ControlGroup label="Preset" inline>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={active === p.id}
              onClick={() => setIdx({ ...idx, rtt: nearestStop(RTT_STOPS, p.rtt), bw: nearestStop(BANDWIDTH_STOPS, p.bandwidth) })}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>
      </>,
      <>
        <Slider label="RTT" value={idx.rtt} min={0} max={RTT_STOPS.length - 1} onChange={(v) => setIdx({ ...idx, rtt: v })} format={(v) => timeText(RTT_STOPS[v])} />
        <Slider label="Bandwidth" value={idx.bw} min={0} max={BANDWIDTH_STOPS.length - 1} onChange={(v) => setIdx({ ...idx, bw: v })} format={(v) => rateText(BANDWIDTH_STOPS[v])} />
        {withWindow && (
          <Slider label="Window" value={idx.win} min={0} max={WINDOW_STOPS.length - 1} onChange={(v) => setIdx({ ...idx, win: v })} format={(v) => sizeText(WINDOW_STOPS[v])} />
        )}
      </>,
    ],
  };
}

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'pipe' });
  const [idx, setIdx] = useState(DEFAULT);
  if (scene === 'transfer') return <TransferScene picker={picker} idx={idx} setIdx={setIdx} />;
  if (scene === 'chatty') return <ChattyScene picker={picker} idx={idx} setIdx={setIdx} />;
  return <PipeScene picker={picker} idx={idx} setIdx={setIdx} />;
}

interface SceneProps {
  picker: ReactNode;
  idx: typeof DEFAULT;
  setIdx: (i: typeof DEFAULT) => void;
}

// ── The pipe ────────────────────────────────────────────────────────────

const CANVAS_H = 240;

function PipeScene({ picker, idx, setIdx }: SceneProps) {
  const { link, controls } = useLink(picker, idx, setIdx);
  const limit = blocksInFlight(link);
  const { world, paused, togglePause } = useSimulation({ create: () => createPipe(limit), step: (w, dt) => stepPipe(w, dt), snapshot: () => null });
  useEffect(() => {
    world().limit = limit;
  }, [world, limit]);
  const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => drawPipe(ctx, w, h, world(), link));
  useLoop(redraw, true);
  useIntroCaption(pipeCaption(link), [link.rtt, link.bandwidth, link.window]);
  const b = bdp(link.bandwidth, link.rtt);
  const thr = throughput(link);

  return (
    <StageFrame
      height={CANVAS_H + 300}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'data in flight' },
        { color: 'var(--violet)', label: 'ACK returning' },
        { color: 'var(--dim)', label: 'empty pipe' },
        { color: 'var(--hi)', label: 'BDP / your window' },
        { color: 'var(--ok)', label: 'bandwidth ceiling', shape: 'line' },
      ]} />}
      stats={
        <Stats>
          <Stat label="BDP" value={sizeText(b)} color="var(--hi)" />
          <Stat label="throughput" value={rateText(thr)} color={windowLimited(link) ? undefined : 'var(--ok)'} />
          <Stat label="pipe full" value={windowLimited(link) ? shareText(link.window, b) : '100%'} />
        </Stats>
      }
      controls={[...controls, <PauseButton key="p" paused={paused} onToggle={togglePause} />]}
    >
      <div className="stage-pad lb">
        <div ref={wrapRef} className="canvas-wrap lb-canvas" style={{ '--h': `${CANVAS_H}px` } as CSSProperties}>
          <canvas ref={canvasRef} role="img" aria-label={`Pipe: ${timeText(link.rtt)} round trip, ${rateText(link.bandwidth)}, window ${sizeText(link.window)}, ${blocksInFlight(link)} of 24 blocks in flight`} />
        </div>
        <ThroughputPlot link={link} />
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

function ThroughputPlot({ link }: { link: Link }) {
  const lo = WINDOW_STOPS[0];
  const hi = WINDOW_STOPS.at(-1)!;
  const yLo = Math.min(link.bandwidth, (lo * 8) / link.rtt) / 2;
  const fn = (w: number) => throughput({ ...link, window: w });
  const b = bdp(link.bandwidth, link.rtt);
  return (
    <div className="lb-plot">
      <SectionTitle weight="regular" hint="both axes log scale">Throughput against window</SectionTitle>
      <Plot2D
        x={{ domain: [lo, hi], log: true, label: 'window', format: sizeText }}
        y={{ domain: [yLo, link.bandwidth * 3], log: true, label: 'throughput', format: rateText }}
        ariaLabel={`Throughput rises with the window until ${sizeText(b)}, the BDP, then stays at ${rateText(link.bandwidth)}`}
      >
        <HLine at={link.bandwidth} tone="ok" />
        {b >= lo && b <= hi && <VLine at={b} label="BDP" tone="hi" />}
        <Curve fn={fn} tone="info" />
        <Points data={[{ x: link.window, y: throughput(link) }]} tone="hi" />
      </Plot2D>
    </div>
  );
}

// ── Transfer time ───────────────────────────────────────────────────────

function TransferScene({ picker, idx, setIdx }: SceneProps) {
  const { link, controls } = useLink(picker, idx, setIdx);
  const [fresh, setFresh] = useState(true);
  useIntroCaption(transferCaption(link, fresh), [link.rtt, link.bandwidth, link.window, fresh]);
  const hs = fresh ? NEW_CONNECTION_RTTS : 0;
  return (
    <StageFrame
      height={300}
      legend={<Legend items={[{ color: 'var(--amber)', label: 'waiting on round trips' }, { color: 'var(--sky)', label: 'bytes on the wire' }]} />}
      controls={[...controls, <Toggle key="c" label="Connection" value={fresh} onChange={setFresh} off="Already open" on={`New (TCP + TLS 1.3: ${NEW_CONNECTION_RTTS} RTTs)`} />]}
    >
      <div className="stage-pad lb">
        <SectionTitle weight="regular" hint="each bar is that fetch's own total, split by share">Fetch one file</SectionTitle>
        <div className="lb-rows">
          {SIZES.map((s) => {
            const t = transferTime(s.bytes, link, hs);
            const lat = (t.latency / t.total) * 100;
            return (
              <div key={s.id} className="lb-row">
                <span className="lb-size">{s.label}</span>
                <div className="lb-share" role="img" aria-label={`${s.label}: ${timeText(t.total)}, ${shareText(t.latency, t.total)} round trips`}>
                  <span className="lb-seg tone-amber" style={{ width: `${lat}%` }} />
                  <span className="lb-seg tone-sky" style={{ width: `${100 - lat}%` }} />
                </div>
                <span className="lb-total">{timeText(t.total)}</span>
                <span className={`chip lb-verdict tone-${t.dominant === 'latency' ? 'amber' : 'sky'}`}>
                  {t.dominant === 'latency' ? 'latency-bound' : 'bandwidth-bound'}
                </span>
                <span className="lb-detail">
                  {t.roundTrips.toLocaleString('en-US')} round trips{t.stalls ? ` (${t.stalls.toLocaleString('en-US')} window stalls)` : ''} + {timeText(t.serialization)} on the wire
                </span>
              </div>
            );
          })}
        </div>
        <Hint block>
          Time = (setup round trips + 1 for the request + window stalls) × RTT + bytes ÷ bandwidth. A stall is a full window sent and its ACK
          awaited, which happens when the window is under the BDP. {HONEST}
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── Chatty vs batched ───────────────────────────────────────────────────

function ChattyScene({ picker, idx, setIdx }: SceneProps) {
  const { link, controls } = useLink(picker, idx, setIdx, false);
  const r = chattyVsBatched(CHATTY_CALLS, CHATTY_EACH, link);
  useIntroCaption(chattyCaption(link), [link.rtt, link.bandwidth]);
  const one = r.one.total;
  const bars = [
    ...Array.from({ length: CHATTY_CALLS }, (_, i) => ({ id: `c${i}`, lane: 'chatty', start: i * one, end: (i + 1) * one, tone: 'bad' as const, kind: 'wait' as const })),
    { id: 'b', lane: 'batched', start: 0, end: r.batched, tone: 'ok' as const, label: '1 call' },
  ];
  return (
    <StageFrame
      height={260}
      legend={<Legend items={[{ color: 'var(--bad)', label: 'chatty: one round trip per call (hatched = waiting)' }, { color: 'var(--ok)', label: 'batched: one call' }]} />}
      stats={
        <Stats>
          <Stat label={`${CHATTY_CALLS} calls`} value={timeText(r.chatty)} color="var(--bad)" />
          <Stat label="1 batched call" value={timeText(r.batched)} color="var(--ok)" />
        </Stats>
      }
      controls={controls}
    >
      <div className="stage-pad lb">
        <SectionTitle weight="regular" hint={`${CHATTY_CALLS} × ${sizeText(CHATTY_EACH)}, on an open connection`}>Same data, two ways</SectionTitle>
        <GanttLanes
          lanes={[{ id: 'chatty', label: 'chatty' }, { id: 'batched', label: 'batched' }]}
          bars={bars}
          domain={[0, r.chatty]}
          unit=" s"
          axis
          size="md"
          labelWidth={72}
          ariaLabel={`${CHATTY_CALLS} sequential calls take ${timeText(r.chatty)}; one batched call takes ${timeText(r.batched)}`}
        />
        <Hint block>To scale: each red segment is one call ({timeText(one)}: a round trip plus {timeText(r.one.serialization)} of bytes). {HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { useRadioGroup } from '../../components/useRadioGroup';
import { WideRegion } from '../../components/WideRegion';
import { bytes, ms } from '../../core/format';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { RTT_DEFAULT, RTT_MAX, RTT_MIN, RTT_STEP } from './constants';
import { buildFrames } from './frames';
import {
  BANDWIDTH_BYTES_PER_MS, FACTS, HUFFMAN_RATIO, LOST_RESOURCE, PAGE, VERSION_NAME, frameStrip, headerBytes, segmentsUntil, simulateAll,
  type ConnCount, type Kind, type Run, type SegmentKind, type Timing, type Version,
} from './model';
import './styles.css';

const VERSIONS: Version[] = ['h1', 'h2', 'h3'];
const STEP_MS = 420;
/** Narrowest width where the 12 lanes and the axis stay readable. */
const WATERFALL_MIN_W = 560;
const LABEL_W = 132;
/** Bars are 12px tall: their text stays the tooltip and accessible name, never drawn. */
const NO_BAR_TEXT = Number.POSITIVE_INFINITY;
/** Plain categories for resource types: never a status colour. */
const KIND_TONE: Record<Kind, Tone> = { html: 'sky', css: 'amber', js: 'violet', img: 'muted' };
const HONEST = 'Illustrative model: fixed RTT, sizes and loss; real browsers and servers prioritise and pace differently.';
const HEADERS = headerBytes();

const SEGMENT_TONE: Record<SegmentKind, Tone> = { waiting: 'dim', transfer: 'info', stalled: 'bad' };
const SEGMENT_SHAPE: Record<SegmentKind, GanttBar['kind']> = { waiting: 'wait', transfer: 'work', stalled: 'blocked' };

/** The bars a response shows at `now`: transfers turn green once the response is complete. */
function barsFor(x: Timing, now: number, picked: string | null): GanttBar[] {
  const complete = now >= x.done - 1e-6;
  return segmentsUntil(x, now).map((s, i) => ({
    id: `${x.id}-${i}`,
    lane: x.id,
    start: s.from,
    end: s.to,
    tone: s.kind === 'transfer' && complete ? 'ok' : SEGMENT_TONE[s.kind],
    kind: SEGMENT_SHAPE[s.kind],
    label: `${x.id}: ${s.kind} ${ms(s.from)}–${ms(s.to)}`,
    ring: picked === x.id ? 'hi' : undefined,
  }));
}

export function Stage() {
  const [rtt, setRtt] = useState(RTT_DEFAULT);
  const [conns, setConns] = useState<ConnCount>(6);
  const [loss, setLoss] = useState(false);
  const [shown, setShown] = useState<Version>('h2');
  const [picked, setPicked] = useState<string | null>(LOST_RESOURCE);
  const phone = useMediaQuery(PHONE_QUERY);
  const params = useMemo(() => ({ rtt, conns, loss }), [rtt, conns, loss]);
  const runs = useMemo(() => simulateAll(params), [params]);
  const end = Math.ceil(Math.max(...VERSIONS.map((v) => runs[v].total)) / 50) * 50;
  const frames = useMemo(() => buildFrames(runs, params, end), [runs, params, end]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame.now;
  const visible = phone ? [shown] : VERSIONS;

  return (
    <StageFrame
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'transferring' },
            { color: 'var(--dim)', label: 'queued / waiting (hatched)' },
            { color: 'var(--bad)', label: 'stalled by the loss (dashed)' },
            { color: 'var(--ok)', label: 'complete' },
          ]}
        />
      }
      stats={
        <Stats>
          {VERSIONS.map((v) => {
            const done = now >= runs[v].total - 1e-6;
            return (
              <Stat key={v} label={VERSION_NAME[v]} value={done ? ms(runs[v].total) : 'loading…'} color={done ? 'var(--ok)' : undefined} />
            );
          })}
        </Stats>
      }
      controls={[
        <>
          <Segmented label="HTTP/1.1 connections" value={conns} onChange={setConns} options={[1, 2, 6].map((n) => ({ value: n as ConnCount, label: String(n) }))} />
          <Toggle label="Lose a packet" value={loss} onChange={setLoss} off="No loss" on={`Drop one (${LOST_RESOURCE})`} />
        </>,
        <Slider key="rtt" label="RTT" value={rtt} min={RTT_MIN} max={RTT_MAX} step={RTT_STEP} onChange={setRtt} format={ms} />,
      ]}
    >
      <div className="stage-pad hv">
        {phone && (
          <Segmented label="Show" value={shown} onChange={setShown} options={VERSIONS.map((v) => ({ value: v, label: VERSION_NAME[v] }))} />
        )}
        <WideRegion minWidth={WATERFALL_MIN_W} label="Waterfalls: scroll sideways to see all of them">
          <div className="hv-waterfalls">
            {visible.map((v) => (
              <Waterfall key={v} run={runs[v]} now={now} end={end} conns={conns} picked={picked} />
            ))}
            {visible.includes('h2') && <FrameStrip run={runs.h2} rtt={rtt} now={now} picked={picked} />}
          </div>
        </WideRegion>
        <StreamPicker picked={picked} onPick={setPicked} />
        <div className="hv-lower">
          <HeaderReadout />
          <FactsTable />
        </div>
        <Hint block>
          {HONEST} Bandwidth {bytes(BANDWIDTH_BYTES_PER_MS * 1000, { base: 1000, dp: 2 })}/s (10 Mbit/s) shared equally by every response sending at that moment;
          no slow start. The page's sub-resources are all found when the HTML arrives. Server push, now deprecated, is left out. During a stall the model idles the whole link for one RTT, so every HTTP/2 stream finishes exactly one RTT later; a real TCP connection keeps receiving into its buffer and releases it in a burst, so the real HTTP/2 versus HTTP/3 gap is smaller than drawn. A stalled stream's bandwidth also goes to the others, so its own finish time can barely move even though it paused.
        </Hint>
      </div>
    </StageFrame>
  );
}

function Waterfall({ run, now, end, conns, picked }: { run: Run; now: number; end: number; conns: ConnCount; picked: string | null }) {
  const v = run.version;
  const lanes = run.timings.map((x) => ({ id: x.id, label: v === 'h1' ? `${x.id} · c${x.conn + 1}` : x.id }));
  const bars = run.timings.flatMap((x) => barsFor(x, now, picked));
  const markers = run.loss && now >= run.loss.at ? [{ at: run.loss.at, label: '✕ lost', tone: 'bad' as Tone }] : [];
  const sub = v === 'h1' ? `${conns} TCP ${conns === 1 ? 'connection' : 'connections'}` : v === 'h2' ? '1 TCP connection, multiplexed' : '1 QUIC connection over UDP';
  return (
    <section className="hv-version" aria-label={`${VERSION_NAME[v]} waterfall`}>
      <SectionTitle weight="regular" hint={sub}>{VERSION_NAME[v]}</SectionTitle>
      <GanttLanes
        lanes={lanes}
        bars={bars}
        domain={[0, end]}
        now={now}
        markers={markers}
        unit=" ms"
        axis
        labelWidth={LABEL_W}
        labelMinPx={NO_BAR_TEXT}
        ariaLabel={`${VERSION_NAME[v]}: page loads in ${ms(run.total)}`}
      />
    </section>
  );
}

/** HTTP/2's one connection: response frames in arrival order, tagged by stream ID. */
function FrameStrip({ run, rtt, now, picked }: { run: Run; rtt: number; now: number; picked: string | null }) {
  const frames = useMemo(() => frameStrip(run, rtt), [run, rtt]);
  const arrived = frames.filter((f) => f.at <= now + 1e-6);
  const loss = run.loss;
  const lostAt = loss ? arrived.findIndex((f) => f.at > loss.at) : -1;
  const showLost = loss !== null && now >= loss.at;
  const cells = arrived.map((f, i) => (
    <span
      key={`${f.type}-${f.stream}-${i}`}
      className={`hv-frame tone-${KIND_TONE[f.kind]} ${f.type === 'HEADERS' ? 'is-headers' : ''} ${picked === f.id ? 'is-picked' : ''}`}
      title={`${f.type} frame, stream ${f.stream} (${f.id})`}
    >
      {f.type === 'HEADERS' ? 'H' : 'D'}
      {f.stream}
    </span>
  ));
  if (showLost) cells.splice(lostAt < 0 ? cells.length : lostAt, 0, <span key="lost" className="hv-frame hv-lost" title="the lost packet">✕</span>);
  return (
    <section className="hv-strip" aria-label="HTTP/2 frames on the connection">
      <SectionTitle weight="regular" hint={`${arrived.length} of ${frames.length} response frames in · H = HEADERS, D = DATA, number = stream ID`}>
        HTTP/2 frames on the wire
      </SectionTitle>
      <div className="hv-frames">{cells.length ? cells : <span className="empty-note">no frames yet</span>}</div>
    </section>
  );
}

/** Pick the stream to light up in the waterfalls and the frame strip: one tab stop, arrow keys inside. */
function StreamPicker({ picked, onPick }: { picked: string | null; onPick: (id: string | null) => void }) {
  const options = [null, ...PAGE.map((r) => r.id)];
  const radio = useRadioGroup(options.length, options.indexOf(picked), (i) => onPick(options[i]));
  return (
    <div className="hv-picker" role="radiogroup" aria-label="Highlight a stream">
      <span className="hv-picker-label">Highlight</span>
      {options.map((id, i) => {
        const r = PAGE.find((x) => x.id === id);
        return (
          <button
            key={id ?? 'none'}
            type="button"
            {...radio.itemProps(i)}
            className={`chip chip-button tone-${r ? KIND_TONE[r.kind] : 'muted'} ${picked === id ? 'is-on' : ''}`}
            onClick={() => onPick(id)}
          >
            {id ?? 'none'}
          </button>
        );
      })}
    </div>
  );
}

function HeaderReadout() {
  const saved = 1 - HEADERS.hpack / HEADERS.http1;
  return (
    <div className="hv-headers">
      <SectionTitle weight="regular">Request headers for the page</SectionTitle>
      <Stats>
        <Stat label="HTTP/1.1 text" value={bytes(HEADERS.http1, { base: 1000 })} sub="12 full copies" color="var(--bad)" />
        <Stat label="HTTP/2 HPACK" value={bytes(HEADERS.hpack, { base: 1000 })} sub={`${Math.round(saved * 100)}% smaller`} color="var(--ok)" />
      </Stats>
      <Hint block>
        HPACK sends a header already in its table as a 1-byte index: the first request costs {HEADERS.hpackFirst} B, the last only {HEADERS.hpackLast} B.
        Estimate: Huffman text taken as {Math.round(HUFFMAN_RATIO * 100)}% of its length (an illustrative ratio). HTTP/3's QPACK works the same way, adapted to
        streams that can arrive out of order.
      </Hint>
    </div>
  );
}

function FactsTable() {
  const rows: { label: string; key: keyof (typeof FACTS)['h1'] }[] = [
    { label: 'Framing', key: 'framing' },
    { label: 'Transport', key: 'transport' },
    { label: 'Header compression', key: 'compression' },
    { label: 'Setup before the first request', key: 'setup' },
    { label: 'Head-of-line blocking', key: 'hol' },
  ];
  return (
    <div className="hv-facts">
      <SectionTitle weight="regular" hint="0-RTT resumption and connection migration: later, with QUIC">Protocol facts</SectionTitle>
      <div className="hv-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th />
              {VERSIONS.map((v) => <th key={v} scope="col" className="keep-case">{VERSION_NAME[v]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                {VERSIONS.map((v) => <td key={v}>{FACTS[v][r.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

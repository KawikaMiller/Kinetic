import { Fragment, useState } from 'react';
import { Bar } from '../../components/Bar';
import { TravelDot } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { bytes, humanDuration, latency, NA, pct, times } from '../../core/format';
import { useElementSize } from '../../core/hooks';
import { logScale } from '../../core/scale';
import { HUMAN_SECONDS_PER_NS, LEVELS, effectiveNs, levelById } from './model';
import './styles.css';

/** Narrowest stage where the ladder's columns still fit without squashing the track. */
const MIN_WIDTH = 720;
/** The log axis: 0.1 ns up to 1 s. */
const AXIS_MIN_NS = 0.1;
const AXIS_MAX_NS = 1e9;
const TRACK_H = 22;
/** Real-time dots move on a log scale: a base trip plus a little per power of ten. */
const LOG_TRIP_BASE_S = 0.8;
const LOG_TRIP_PER_DECADE_S = 0.55;
/** Axis ticks worth a label. */
const LABELLED_TICKS = [1, 1e3, 1e6, 1e9];
/** Capacity bars on a log scale from 512 B to the largest level. */
const CAPACITY_FLOOR = 512;
const CAPACITY_MAX = Math.max(...LEVELS.map((l) => l.capacity ?? 0));

const FAST = levelById('l1');
const SLOW = levelById('ram');

type Scale = 'real' | 'human';

export function Stage() {
  const [scale, setScale] = useState<Scale>('real');
  const [race, setRace] = useState(0);
  const [hitPct, setHitPct] = useState(95);
  const setCaption = useSetCaption();
  const [trackRef, { width: trackW }] = useElementSize<HTMLDivElement>();
  useIntroCaption(<>From a register to the other side of the planet, the times differ by <b>almost a billion</b>. The track is a log scale: each tick is 1,000× the last.</>);

  const show = (ns: number) => (scale === 'real' ? latency(ns) : humanDuration(ns * HUMAN_SECONDS_PER_NS));
  const x = logScale(AXIS_MIN_NS, AXIS_MAX_NS, 0, Math.max(1, trackW));
  const trip = (ns: number) => (scale === 'real' ? LOG_TRIP_BASE_S + LOG_TRIP_PER_DECADE_S * Math.log10(ns / LEVELS[0].ns) : ns * HUMAN_SECONDS_PER_NS);

  const pickScale = (human: boolean) => {
    setScale(human ? 'human' : 'real');
    setRace((n) => n + 1);
    setCaption(
      human ? (
        <>Stretch time so <b>1 ns = 1 second</b>: L1 is a second, RAM is <span className="hl">{humanDuration(SLOW.ns)}</span>, an SSD read is {humanDuration(levelById('nvme').ns)}, a round trip to Europe is <span className="hl bad">{humanDuration(levelById('wan').ns)}</span>. The slow dots barely move.</>
      ) : (
        <>Back to real time. The dots use a log scale here, otherwise only the top rows would ever move.</>
      ),
    );
  };

  const hit = hitPct / 100;
  const eff = effectiveNs(hit, FAST.ns, SLOW.ns);
  const onHit = (v: number) => {
    setHitPct(v);
    const e = effectiveNs(v / 100, FAST.ns, SLOW.ns);
    setCaption(<>With a {v}% hit rate the average access is <span className="hl ok">{show(e)}</span>: {times((SLOW.ns / e).toFixed(1))} faster than always going to RAM.</>, { quiet: true });
  };

  return (
    <StageFrame
      minWidth={MIN_WIDTH}
      height={460}
      stats={
        <Stats>
          <Stat label="RAM vs L1" value={times(SLOW.ns / FAST.ns)} color="var(--bad)" sub="RAM is not fast" />
          <Stat label="Avg access" value={show(eff)} color="var(--ok)" sub={`${hitPct}% cache hits`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a request travelling', shape: 'dot' },
            { color: 'var(--info)', label: 'latency' },
            { color: 'var(--violet)', label: 'capacity' },
          ]}
        />
      }
      controls={[
        <Fragment key="time">
          <Toggle label="Time" value={scale === 'human'} onChange={pickScale} off="Real" on="Human (1 ns = 1 s)" />
          <Button onClick={() => setRace((n) => n + 1)}>Race again</Button>
        </Fragment>,
        <Slider key="hit" label="Cache hit rate" value={hitPct} min={50} max={100} onChange={onHit} format={(v) => `${v}%`} />,
      ]}
    >
      <div className="mh">
        <div className="mh-grid mh-head">
          <span className="section-title">level</span>
          <div className="mh-axis" ref={trackRef}>
            {LABELLED_TICKS.map((t) => (
              // The axis ends at the last tick: anchor its label inward so it can't spill into the next column.
              <span key={t} className={`mh-tick ${t === AXIS_MAX_NS ? 'is-end' : ''}`} style={{ left: `${(x.map(t) / Math.max(1, trackW)) * 100}%` }}>
                {show(t)}
              </span>
            ))}
          </div>
          <span className="section-title">access time</span>
          <span className="section-title">typical size</span>
        </div>

        {LEVELS.map((l) => {
          const end = x.map(l.ns);
          return (
            <div key={l.id} className="mh-grid mh-row">
              <span className="mh-name">
                {l.name}
                <small>{l.note}</small>
              </span>
              <svg className="mh-track" width={trackW} height={TRACK_H} viewBox={`0 0 ${Math.max(1, trackW)} ${TRACK_H}`} aria-hidden="true">
                {/* One colour for every latency bar: red/green/yellow already mean "slow"/"average"/"travelling" here. */}
                <rect className="mh-bar" x={0} y={TRACK_H / 2 - 3} width={Math.max(2, end)} height={6} rx={3} />
                {trackW > 0 && (
                  <TravelDot
                    key={`${race}-${scale}`}
                    path={[{ x: 0, y: TRACK_H / 2 }, { x: end, y: TRACK_H / 2 }]}
                    color="var(--hi)"
                    r={5}
                    duration={trip(l.ns)}
                    repeat
                  />
                )}
              </svg>
              <span className="mh-time">{show(l.ns)}</span>
              {l.capacity ? (
                <Bar
                  value={Math.log(l.capacity / CAPACITY_FLOOR)}
                  max={Math.log(CAPACITY_MAX / CAPACITY_FLOOR)}
                  tone="violet"
                  height={6}
                  trailing={<span className="mh-size">{bytes(l.capacity, { dp: 0 })}</span>}
                  className="mh-cap"
                />
              ) : (
                <span className="mh-size mh-na">{NA} not storage</span>
              )}
            </div>
          );
        })}

        <div className="mh-cache">
          <span className="section-title">why caches exist · L1 hit {show(FAST.ns)}, miss to RAM {show(SLOW.ns)}</span>
          {[
            { label: 'always RAM', ns: SLOW.ns, tone: 'bad' as const },
            { label: `${pct(hit)} hits`, ns: eff, tone: 'ok' as const },
            { label: 'always L1', ns: FAST.ns, tone: 'info' as const },
          ].map((row) => (
            <Bar key={row.label} value={row.ns} max={SLOW.ns} tone={row.tone} height={8} label={<span className="mh-cache-label">{row.label}</span>} trailing={<span className="mh-size">{show(row.ns)}</span>} className="mh-cache-bar" />
          ))}
        </div>

        <Hint block>Approximate orders of magnitude; vary by hardware. In real time the dots move on a log scale, so the slow rows still move.</Hint>
      </div>
    </StageFrame>
  );
}

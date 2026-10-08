import { useMemo, useState, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { CodePanel } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { lazyFrames } from './frames';
import { EAGER_CODE, FILTERS, HELPER_CODE, LAZY_CODE, STATIONS, TAKES, eagerRun, pipelineCode, showArray, type FilterId, type Station, type TakeN } from './model';

const LANE_W = 360;
const LANE_H = 118;
const STATION_W = 72;
const STATION_Y = 42;
const XS: Record<Station, number> = { range: 46, map: 135, filter: 224, take: 313 };
const TONE: Record<Station, Tone> = { range: 'muted', map: 'info', filter: 'violet', take: 'ok' };
const TITLE: Record<Station, string> = { range: 'range', map: 'map x²', filter: 'filter', take: 'take' };
const HOP_S = 0.55;

const big = (n: number) => n.toLocaleString('en-US');

function Lane({ counts, tone, children, label }: { counts: Record<Station, number>; tone: 'orange' | 'ok'; children?: ReactNode; label: string }) {
  return (
    <svg viewBox={`0 0 ${LANE_W} ${LANE_H}`} className="itg-lane" role="img" aria-label={`${label}: ${STATIONS.map((s) => `${s} handled ${counts[s]}`).join(', ')}`}>
      {STATIONS.slice(1).map((s, i) => (
        <line key={s} className="scene-edge" x1={XS[STATIONS[i]] + STATION_W / 2} y1={STATION_Y} x2={XS[s] - STATION_W / 2} y2={STATION_Y} />
      ))}
      {STATIONS.map((s) => (
        <SceneNode key={s} at={{ x: XS[s], y: STATION_Y }} w={STATION_W} h={40} title={TITLE[s]} tone={TONE[s]} on className="itg-station" />
      ))}
      {STATIONS.map((s) => (
        <text key={s} x={XS[s]} y={STATION_Y + 46} textAnchor="middle" className={`itg-count tone-${tone}`}>
          {big(counts[s])}
        </text>
      ))}
      {children}
    </svg>
  );
}

export function PipeScene({ picker }: { picker: ReactNode }) {
  const [filterId, setFilterId] = useState<FilterId>('even');
  const [n, setN] = useState<TakeN>(3);
  const frames = useMemo(() => lazyFrames(filterId, n), [filterId, n]);
  const eager = useMemo(() => eagerRun(filterId, n), [filterId, n]);
  const player = usePlayer(frames, { interval: 900 });
  const f = player.frame;
  const e = f.event;
  const eagerCounts = { range: eager.produced, map: eager.squared, filter: eager.filtered, take: eager.result.length };

  return (
    <StageFrame
      player={player}
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'value moving now' },
            { color: 'var(--info)', label: 'map' },
            { color: 'var(--violet)', label: 'filter' },
            { color: 'var(--ok)', label: 'take; lazy counts' },
            { color: 'var(--dim)', label: 'dropped by the filter' },
            { color: 'var(--orange)', label: 'eager counts (the costly side)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="filter" value={filterId} onChange={setFilterId} options={FILTERS.map((x) => ({ value: x.value, label: x.label }))} />
          <Segmented label="take" value={n} onChange={setN} options={TAKES.map((t) => ({ value: t, label: String(t) }))} />
        </>,
      ]}
    >
      <div className="itg stage-pad">
        <div className="itg-lanes">
          <div className="itg-lane-box">
            <SectionTitle>Eager arrays · counted, not animated item by item</SectionTitle>
            <Lane counts={eagerCounts} tone="orange" label="Eager pipeline totals" />
            <Hint block>
              {eager.arrays} arrays, {big(eager.elements)} elements allocated, to keep <b>{showArray(eager.result)}</b>.
            </Hint>
          </div>
          <div className="itg-lane-box">
            <SectionTitle>
              Lazy generators · <AnimatedValue value={f.counts.range} as="b" className="itg-pulled" /> pulled from range
            </SectionTitle>
            <Lane counts={f.counts} tone="ok" label="Lazy pipeline, live">
              {e && (
                <Packet
                  key={player.index}
                  path={e.dropped ? [{ x: XS.filter, y: STATION_Y }, { x: XS.filter, y: LANE_H - 6 }] : [{ x: XS[e.from], y: STATION_Y - 30 }, { x: XS[e.to!], y: STATION_Y - 30 }]}
                  label={String(e.value)}
                  color={e.dropped ? 'var(--dim)' : 'var(--hi)'}
                  arrive="stay"
                  duration={HOP_S}
                  height={20}
                />
              )}
            </Lane>
            <Hint block>result so far: <b>{showArray(f.result)}</b></Hint>
          </div>
        </div>
        <div className="itg-row">
          <div className="itg-col">
            <CodePanel title="eager" lines={pipelineCode(EAGER_CODE, filterId, n)} className="itg-code" />
          </div>
          <div className="itg-col">
            <CodePanel title="lazy (generators written in this lesson)" lines={pipelineCode(LAZY_CODE, filterId, n)} className="itg-code" />
          </div>
        </div>
        <CodePanel title="the helpers the lazy lane runs (and take, which stops the whole chain)" lines={HELPER_CODE} className="itg-code" />
        <Hint block>
          Every count comes from running the pipeline. ES2025 adds built-in iterator helpers (Iterator.prototype.map, filter, take); the lesson writes its own generator functions so every
          step is visible.
        </Hint>
      </div>
    </StageFrame>
  );
}

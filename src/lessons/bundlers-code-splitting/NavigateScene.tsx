import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar, type GanttLane } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { ms } from '../../core/format';
import { barLabelPx } from '../../core/gantt';
import { clamp01 } from '../../core/math';
import { usePlayer } from '../../core/usePlayer';
import type { Tone } from '../../core/tone';
import { OptionToggles } from './OptionToggles';
import { APP_LABEL, NET, kbText, type AppOptions, type Chunk } from './model';
import { LEVELS, firstLoadFetches, firstLoadKb, navFrames, scenariosFor, type Level, type Scenario } from './navFrames';

const STEP_MS = 1100;
const WATERFALL_MIN_W = 480;
const END_PAD = 150;
const TICK = 100;
const MAIN_LANE = 'main';

const LEGEND = [
  { color: 'var(--info)', label: 'download for the first screen' },
  { color: 'var(--sky)', label: 'shared chunk' },
  { color: 'var(--violet)', label: 'download after the click' },
  { color: 'var(--hi)', label: 'running on the main thread' },
];

const shortName = (c: Chunk) => (c.kind === 'module' ? APP_LABEL[c.modules[0] as keyof typeof APP_LABEL] : c.kind === 'lazy' ? 'reports chunk' : c.id);

function bar(b: Omit<GanttBar, 'progress' | 'tone'> & { tone: Tone }, now: number): GanttBar {
  if (now <= b.start) return { ...b, tone: undefined, progress: 0 };
  return { ...b, progress: clamp01((now - b.start) / (b.end - b.start)) };
}

function barsAt(s: Scenario, now: number): GanttBar[] {
  const lazy = new Set(s.plan.lazyChunks);
  const kind = (id: string) => s.chunks.find((c) => c.id === id)!.kind;
  const fetches = s.plan.fetches.map((f) =>
    bar({ id: `get-${f.chunk}`, lane: f.chunk, start: f.start, end: f.done, tone: lazy.has(f.chunk) ? 'violet' : kind(f.chunk) === 'shared' ? 'sky' : 'info', label: kbText(s.chunks.find((c) => c.id === f.chunk)!.kb) }, now),
  );
  const runs = s.plan.runs.map((r) => bar({ id: `run-${r.chunk}`, lane: MAIN_LANE, start: r.start, end: r.end, tone: 'hi', label: 'run' }, now));
  return [...fetches, ...runs];
}

const lanesOf = (s: Scenario): GanttLane[] => [...s.chunks.map((c) => ({ id: c.id, label: shortName(c) })), { id: MAIN_LANE, label: 'main thread' }];

export function NavigateScene({ picker, options, onOptions }: { picker: ReactNode; options: AppOptions; onOptions: (o: AppOptions) => void }) {
  const [level, setLevel] = useState<Level>('split');
  const scenarios = useMemo(() => scenariosFor(options), [options]);
  const s = scenarios[level];
  const frames = useMemo(() => navFrames(s), [s]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const now = player.frame.now;
  const end = Math.ceil((s.plan.visibleAt + END_PAD) / TICK) * TICK;

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="First load" value={kbText(firstLoadKb(s))} sub={`${firstLoadFetches(s).length} request(s)`} color="var(--info)" />
          <Stat label="First screen works" value={ms(s.plan.interactiveAt)} />
          <Stat label="Reports after click" value={ms(s.plan.visibleAt - s.plan.clickAt)} color={s.plan.lazyChunks.length ? 'var(--violet)' : 'var(--ok)'} />
        </Stats>
      }
      legend={<Legend items={LEGEND} />}
      controls={[
        <Fragment key="level">
          {picker}
          <Segmented label="Shipped as" value={level} onChange={setLevel} options={LEVELS} />
        </Fragment>,
        <OptionToggles key="options" options={options} onChange={onOptions} />,
      ]}
    >
      <div className="stage-pad bcs">
        <SectionTitle weight="regular" hint="a scripted page load, then a click on Reports">Loading</SectionTitle>
        <WideRegion minWidth={WATERFALL_MIN_W} label="Waterfall: scroll sideways to see all of it">
          <GanttLanes
            lanes={lanesOf(s)}
            bars={barsAt(s, now)}
            domain={[0, end]}
            now={now}
            markers={[
              { at: s.plan.interactiveAt, label: 'first screen', tone: 'ok' },
              { at: s.plan.clickAt, label: 'click', tone: 'muted' },
              ...(s.plan.lazyChunks.length ? [{ at: s.plan.visibleAt, label: 'reports', tone: 'ok' as const }] : []),
            ]}
            unit=" ms"
            axis
            size="md"
            labelWidth={96}
            labelMinPx={barLabelPx('000 KB')}
            ariaLabel={`Waterfall for the ${LEVELS.find((l) => l.value === level)!.label} build`}
          />
        </WideRegion>
        <div className="bcs-table-wrap">
          <SectionTitle weight="regular" hint="the same app, shipped four ways">Compared</SectionTitle>
          <table className="data-table bcs-table">
            <thead>
              <tr><th>Shipped as</th><th>Files</th><th>First load</th><th>First screen</th><th>Reports after click</th></tr>
            </thead>
            <tbody>
              {LEVELS.map((l) => {
                const sc = scenarios[l.value];
                return (
                  <tr key={l.value} className={l.value === level ? 'is-current' : ''}>
                    <td>{l.label}</td>
                    <td>{sc.chunks.length}</td>
                    <td>{kbText(firstLoadKb(sc))}</td>
                    <td>{ms(sc.plan.interactiveAt)}</td>
                    <td>{ms(sc.plan.visibleAt - sc.plan.clickAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Hint block>
          Scripted: every request costs a {ms(NET.rtt)} round trip plus its bytes at {NET.kbPerMs} KB per ms, the model allows {NET.connections} requests at once, and running code costs {NET.execMsPerKb} ms
          per KB. Shared and lazy chunks are requested together with the first load or the click (as a bundler&apos;s preload hints would). Real tools and networks differ; the
          trade-off is real: more files help only while the bytes saved outweigh the extra round trips.
        </Hint>
      </div>
    </StageFrame>
  );
}

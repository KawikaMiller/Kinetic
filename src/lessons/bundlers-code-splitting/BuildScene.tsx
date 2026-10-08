import { useMemo, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { GraphView } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, shakeEvents } from './buildFrames';
import { OptionToggles } from './OptionToggles';
import { APP_IDS, APP_LABEL, buildApp, kbText, type AppId, type AppOptions } from './model';
import { bytesSegments, edgeMarkOf, markOf, nodeState, type NodeState } from './view';

const STEP_MS = 1000;
/** Narrowest width where the layered graph's labels stay readable. */
const GRAPH_MIN_W = 520;
const BOX = { w: 92, h: 34, rx: 8 };
const SPACING = { direction: 'right', layerGap: 124, nodeGap: 46, padMain: 54, padCross: 26 } as const;

const LEGEND = [
  { color: 'var(--hi)', label: 'being visited' },
  { color: 'var(--info)', label: 'in the bundle, or the initial chunk' },
  { color: 'var(--dim)', label: 'shaken out (dashed)' },
  { color: 'var(--orange)', label: 'kept only for side effects (while shaking)' },
  { color: 'var(--violet)', label: 'lazy chunk' },
  { color: 'var(--sky)', label: 'shared chunk' },
];

export function BuildScene({ picker, options, onOptions }: { picker: ReactNode; options: AppOptions; onOptions: (o: AppOptions) => void }) {
  const b = useMemo(() => buildApp(options), [options]);
  const frames = useMemo(() => buildFrames(b, options), [b, options]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const events = useMemo(() => shakeEvents(b), [b]);
  const states = Object.fromEntries(APP_IDS.map((id) => [id, nodeState(f, b, id)] as const)) as Record<string, NodeState>;
  const { segments, shown } = bytesSegments(f, b);
  const resolved = (id: string) => f.phase !== 'walk' && (events.slice(0, f.shakeStep).some((e) => e.id === id) || f.shakeStep === events.length);

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="In the bundle" value={kbText(shown)} color="var(--info)" />
          <Stat label="Unshaken total" value={kbText(b.fullKb)} sub={`${b.walk.length} modules`} />
        </Stats>
      }
      legend={<Legend items={LEGEND} />}
      controls={[
        <>
          {picker}
          <OptionToggles options={options} onChange={onOptions} />
        </>,
      ]}
    >
      <div className="stage-pad bcs">
        <SectionTitle weight="regular" hint="sizes are made-up KB, a fictional app">Module graph</SectionTitle>
        <WideRegion minWidth={GRAPH_MIN_W} label="Module graph: scroll sideways to see all of it">
          <GraphView
            nodes={APP_IDS.map((id) => ({ id, shape: 'box' as const, label: APP_LABEL[id] }))}
            edges={b.graph.imports.map((i) => ({ from: i.from, to: i.to }))}
            layout="layered"
            directed
            spacing={SPACING}
            box={BOX}
            className="bcs-graph"
            ariaLabel="Module graph of a fictional app: main imports router, button and utils; the router imports the three pages; settings and reports import the date library; reports imports a chart library"
            nodeMark={(id) => markOf(states[id])}
            nodeClass={(id) => (states[id] === 'dropped' ? 'bcs-dropped' : '')}
            edgeMark={(e) => edgeMarkOf(b.graph.imports.find((i) => i.from === e.from && i.to === e.to)!, f, states)}
          />
        </WideRegion>
        <div className="bcs-below">
          <div className="bcs-bytes">
            <SectionTitle weight="regular" hint="what is shipped; grey is shaken out">Bytes</SectionTitle>
            <Bar segments={segments} max={b.fullKb} height={14} animate={false} ariaLabel={`${kbText(shown)} of ${kbText(b.fullKb)} in the bundle`} />
          </div>
          <div className="bcs-exports">
            <SectionTitle weight="regular" hint="named exports: ES modules can lose the unused ones">Exports</SectionTitle>
            {(['utils', 'datelib'] as AppId[]).map((id) => {
              const m = b.graph.modules[id];
              return (
                <div key={id} className="bcs-export-row">
                  <code className="bcs-export-name">{APP_LABEL[id]}{m.cjs ? ' (CommonJS)' : ''}</code>
                  {m.exports.map((e) => {
                    const kept = b.shaken.keptExports[id]?.includes(e.name);
                    return (
                      <span key={e.name} className={`bcs-chip ${resolved(id) ? (kept ? 'is-kept' : 'is-gone') : ''}`}>
                        {e.name}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <Hint block>
          A model of what bundlers do with a fictional app: reachability, tree shaking and chunking follow the general rules, but real tools (and their heuristics) differ in detail. Sizes are
          made up (parse and run cost follows the uncompressed size, so treat them as that), and minification and source maps are left out.
        </Hint>
      </div>
    </StageFrame>
  );
}

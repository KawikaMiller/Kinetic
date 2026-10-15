import { useMemo, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { Curve, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { minWidthForText } from '../../core/scale';
import { useGraphEdits } from '../../core/useGraphEdits';
import { usePlayer } from '../../core/usePlayer';
import {
  DEFAULT_DAMPING, MAX_ITERATIONS, WEB_SIZE, addLink, addPage, deadEndsOf, presetById, rankSteps, removeLastLink, trapsOf, PRESETS, type DeadEnds, type PresetId, type Web,
} from './pagerank';
import { n4, rankCaption } from './text';

const STEP_MS = 500;
const NODE_RADIUS = 10;
/** A page's drawn radius is this times the square root of its rank, so area follows rank. */
const RANK_RADIUS = 60;
const GRAPH_MIN_WIDTH = minWidthForText(WEB_SIZE.width, 13);
const CHANGE_FLOOR = 1e-12;
const CHANGE_AXIS = 1e-9;

const DEAD_OPTIONS = { off: 'Drop their rank', on: 'Spread it uniformly' } as const;

export function RankScene({ picker, presetIds, initial }: { picker: ReactNode; presetIds: readonly PresetId[]; initial: PresetId }) {
  const shown = PRESETS.filter((p) => presetIds.includes(p.id));
  const edits = useGraphEdits<Web, PresetId>({ presets: shown, initial, graphOf: (id) => presetById(id).web, edgeCount: (w) => w.edges.length });
  const w = edits.graph;
  const [d, setD] = useState(DEFAULT_DAMPING);
  const [dead, setDead] = useState<DeadEnds>('spread');
  const steps = useMemo(() => rankSteps(w, d, dead, MAX_ITERATIONS), [w, d, dead]);
  const frames = useMemo(() => steps.map((s, i) => ({ i, say: rankCaption(w, d, dead, s, i) })), [steps, w, d, dead]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const step = steps[player.frame.i];
  const deadEnds = deadEndsOf(w);
  const traps = trapsOf(w);
  const first = steps[1]?.change ?? 0;
  const bound = first > CHANGE_AXIS ? steps.map((_, t): [number, number] => [t, Math.max(CHANGE_FLOOR, first * d ** (t - 1))]).slice(1) : null;
  const measured = steps.slice(1, player.frame.i + 1).map((s, t): [number, number] => [t + 1, Math.max(CHANGE_FLOOR, s.change)]);
  const leaked = step.total < 1 - 1e-9;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Total rank" value={n4(step.total)} color={leaked ? 'var(--bad)' : 'var(--ok)'} sub={leaked ? 'rank has leaked out' : 'sums to 1'} />
          <Stat label="Damping d" value={d.toFixed(2)} sub={`teleport share (1 − d)/${w.names.length} = ${n4((1 - d) / w.names.length)}`} />
          <Stat label="L1 change this step" value={player.frame.i === 0 ? '–' : step.change.toExponential(2)} sub={d < 1 ? `at most d × the step before, d = ${d.toFixed(2)}` : 'no teleport to pull it back'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a page: its area is its rank', shape: 'dot' },
            { color: 'var(--bad)', label: 'a dead end that drops rank', shape: 'dot' },
            { color: 'var(--dim)', label: 'the teleport share', shape: 'square' },
            { color: 'var(--bad)', label: 'L1 change per step (log axis)', shape: 'line' },
            { color: 'var(--violet)', label: 'the d^t bound', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Web" inline>
            {shown.map((p) => (
              <ChipButton key={p.id} tone="info" on={p.id === edits.presetId} onClick={() => { edits.load(p.id); player.restart(); }}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Slider label="Damping d" value={d} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={setD} />
          <Toggle label="Dead ends" value={dead === 'spread'} onChange={(on) => setDead(on ? 'spread' : 'drop')} off={DEAD_OPTIONS.off} on={DEAD_OPTIONS.on} />
        </>,
        <>
          <Button onClick={() => edits.edit(addPage(w), 'Added a page: drag from one page to another to link them.')} softDisabled={w.names.length >= 8}>Add page</Button>
          <Button onClick={() => edits.undoAdded(removeLastLink, 'Removed the last link you added.')} softDisabled={edits.added === 0}>Undo last link</Button>
          <Hint>Drag from a page to another to add a link (keyboard: C on a page, then Enter on another). Self-links and repeats are refused. {edits.note}</Hint>
        </>,
      ]}
    >
      <div className="ep-stage stage-pad">
        <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Web of pages: scroll sideways to see all of it">
          <GraphView
            nodes={w.names.map((label, id) => ({ id, label, at: w.at[id] }))}
            edges={w.edges.map(([from, to]) => ({ from, to }))}
            directed
            width={WEB_SIZE.width}
            height={WEB_SIZE.height}
            radius={NODE_RADIUS}
            className="ep-web"
            nodeMark={(id) => (dead === 'drop' && deadEnds.includes(id) ? { tone: 'bad', fill: 'tint' } : null)}
            renderNode={(n, at, base) => (
              <>
                <circle cx={at.x} cy={at.y} r={Math.max(NODE_RADIUS, RANK_RADIUS * Math.sqrt(step.r[Number(n.id)]))} className="ep-rank-disc" />
                {base}
              </>
            )}
            nodeAriaLabel={(id) => `Page ${w.names[id]}, rank ${n4(step.r[id])}`}
            editable={{ onAddEdge: (from, to) => edits.edit(addLink(w, from, to), `Added a link from ${w.names[from]} to ${w.names[to]}.`) }}
            ariaLabel={`Web of ${w.names.length} pages and ${w.edges.length} links, sized by rank`}
          />
        </WideRegion>
        <table className="ep-ranks" aria-label="Rank of each page at this step">
          <thead>
            <tr><th scope="col">page</th><th scope="col">rank</th><th scope="col">links out</th></tr>
          </thead>
          <tbody>
            {w.names.map((name, i) => (
              <tr key={name} className={deadEnds.includes(i) ? 'is-dead' : undefined}>
                <th scope="row">{name}</th>
                <td>{n4(step.r[i])}</td>
                <td>{w.edges.filter(([a]) => a === i).length || 'none'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Plot2D x={{ domain: [0, MAX_ITERATIONS], label: 'step', ticks: 6 }} y={{ domain: [CHANGE_AXIS, 2], log: true, label: 'L1 change', ticks: 5 }} ariaLabel="L1 change of the ranks per step on a log axis, with the d^t bound">
          {bound && <Curve points={bound} tone="violet" dashed />}
          {measured.length > 1 && <Curve points={measured} tone="bad" />}
        </Plot2D>
        {traps.length > 0 && <p className="ep-note">Spider trap: the pages {traps.map((t) => t.map((i) => w.names[i]).join(', ')).join(' and ')} only link among themselves.</p>}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a toy web of {w.names.length} pages, computed live by power iteration</Provenance>
        <Provenance kind="from-memory">the original paper&apos;s damping of 0.85 is from memory: verify before quoting; no claim is made about any real search engine</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

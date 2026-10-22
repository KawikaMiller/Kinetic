import { useMemo, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { minWidthForText } from '../../core/scale';
import { STAR_AT, STAR_M, STAR_NAMES, clampM, starBanner, starCaption, starEdges, starFacts, starOrderNote } from './star';

const GRAPH_W = 560;
const GRAPH_H = 300;
const NODE_R = 22;
const GRAPH_MIN_WIDTH = minWidthForText(GRAPH_W, 14, 420);
const DIAGONAL_LABEL_AT = 0.22;
const TOUR_EDGE_WIDTH = 5;
const M_CHIPS: readonly number[] = [STAR_M.min, 2, 4.75, 10, 100];

const closed = (tour: readonly number[]) => tour.map((v, i) => [v, tour[(i + 1) % tour.length]] as const);
const sameEdge = (e: readonly [number, number], a: number, b: number) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a);
const isDiagonal = (a: number, b: number) => (a === 1 && b === 2) || (a === 3 && b === 4);

/** Scene 3: a 5-node star whose leaf-to-leaf distance M the learner raises until the triangle inequality, and the guarantee with it, fails. */
export function StarScene({ picker }: { picker: ReactNode }) {
  const [m, setM] = useState<number>(STAR_M.default);
  const facts = useMemo(() => starFacts(m), [m]);
  const edges = useMemo(() => starEdges(m), [m]);
  const tour = useMemo(() => closed(facts.doublingTour), [facts]);
  const best = useMemo(() => closed(facts.optimumTour), [facts]);
  const banner = starBanner(facts);
  const caption = starCaption(facts);

  return (
    <StageFrame
      height={400}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Optimum tour" value={facts.optimumLength} color="var(--ok)" sub="exact, Held-Karp" />
          <Stat label="MST doubling" value={facts.doublingLength} sub={`index order; tree weight ${facts.mstWeight}, tour 3.5 + 2M`} />
          <Stat label="Ratio" value={facts.ratio.toFixed(2)} color={facts.violates ? 'var(--bad)' : undefined} sub={facts.violates ? 'bound of 2 no longer applies' : 'within the metric bound'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'MST doubling tour', shape: 'line' },
            { color: 'var(--ok)', label: 'optimum tour', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Leaf-to-leaf distance M" value={m} min={STAR_M.min} max={STAR_M.max} step={STAR_M.step} onChange={(v) => setM(clampM(v))} />
          <ControlGroup label="Set M">
            {M_CHIPS.map((v) => (
              <ChipButton key={v} on={m === v} onClick={() => setM(v)}>{v}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad aa-stage">
        <WideRegion minWidth={GRAPH_MIN_WIDTH} label="Star: scroll sideways to see all of it">
          <GraphView
            nodes={STAR_NAMES.map((label, i) => ({ id: i, label, at: STAR_AT[i] }))}
            edges={edges.map(({ edge: [from, to], weight }) => ({ from, to, weight, labelAt: isDiagonal(from, to) ? DIAGONAL_LABEL_AT : undefined }))}
            width={GRAPH_W}
            height={GRAPH_H}
            radius={NODE_R}
            labelHalo
            className="aa-graph"
            ariaLabel={`Star with centre O and leaves L1 to L4; leaf-to-leaf distance M is ${m}`}
            edgeMark={(e) => {
              const [a, b] = [Number(e.from), Number(e.to)];
              if (best.some((x) => sameEdge(x, a, b))) return { tone: 'ok', width: TOUR_EDGE_WIDTH, dashed: true };
              if (tour.some((x) => sameEdge(x, a, b))) return { tone: 'info', width: TOUR_EDGE_WIDTH };
              return null;
            }}
            nodeAriaLabel={(v) => `Vertex ${STAR_NAMES[v]}`}
            edgeAriaLabel={(e) => `Distance ${e.weight} between ${STAR_NAMES[Number(e.from)]} and ${STAR_NAMES[Number(e.to)]}`}
          />
        </WideRegion>
        <div role="status" className="aa-note">
          {banner && <Hint tone="bad" block>{banner}</Hint>}
          <Hint block>{starOrderNote(facts)}</Hint>
          <Hint block>Christofides is not drawn here: its tour depends on the Euler-circuit tie-break and would look better than it should. The three expensive pairs are L1-L2, L1-L4 and L3-L4; the three cheap pairs cost 1.5.</Hint>
        </div>
        <div className="aa-proof">
          <ClaimLabel kind="theorem">on a metric, shortcutting never lengthens a tour; without the triangle inequality that step fails, as the ratio growing with M shows</ClaimLabel>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a 5-node instance built by hand so the optimum is a sum you can check</Provenance>
        <Provenance kind="invented">the distances are chosen to break the triangle inequality, not measured from a map</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

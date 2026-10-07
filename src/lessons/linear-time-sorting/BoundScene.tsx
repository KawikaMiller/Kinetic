import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { boundFrames } from './frames';
import { answersFor, boundSeries, childrenOf, DECISION_TREE, INPUT_ORDERS, leaves, lowerBound, nodeOf, TREE_ROOT, type Triple } from './model';

const STEP_MS = 1200;
const TREE_W = 540;
const TREE_H = 236;
const LEVEL_GAP = 62;
const ASK_BOX = { w: 76, h: 30 };
const LEAF_BOX = { w: 62, h: 28 };
const PLOT_N = 64;
const SERIES = boundSeries(PLOT_N);
const AT_MAX = SERIES[PLOT_N - 1];

const SHAPE: TreeShape<string> = { root: TREE_ROOT, children: childrenOf };
/** The question nodes, whose two edges get yes / no labels. */
const ASKS = [...DECISION_TREE.values()].filter((n) => n.kind === 'ask').map((n) => n.id);
const tripleText = (v: Triple) => `${v.a} ${v.b} ${v.c}`;
const sameTriple = (x: Triple | null, y: Triple) => !!x && x.a === y.a && x.b === y.b && x.c === y.c;

export function BoundScene({ picker }: { picker: ReactNode }) {
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [values, setValues] = useState<Triple | null>(null);
  const frames = useMemo(() => boundFrames(answers, values), [answers, values]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const here = nodeOf(f.path[f.path.length - 1]);
  const onPath = new Set(f.path);

  const answer = (yes: boolean) => {
    if (here.kind === 'leaf') return;
    const next = [...f.answers, yes];
    player.queueNext({ play: false, from: next.length });
    setValues(null);
    setAnswers(next);
  };
  const pickInput = (v: Triple) => {
    setValues(v);
    setAnswers(answersFor(v));
  };
  const startOver = () => {
    setValues(null);
    setAnswers([]);
  };

  const atLeaf = here.kind === 'leaf';
  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Comparisons" value={f.answers.length} color="var(--hi)" sub="on this path" />
          <Stat label="Worst case, 3 items" value={lowerBound(3)} color="var(--info)" sub={`= ⌈log₂ 3!⌉ = ⌈log₂ ${leaves().length}⌉`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'comparison now' },
            { color: 'var(--violet)', label: 'path taken' },
            { color: 'var(--ok)', label: 'leaf reached' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Answer" inline>
            {/* aria-disabled, not disabled: a pressed button stays focusable when the walk reaches a leaf. */}
            <Button onClick={() => answer(true)} aria-disabled={atLeaf} className="lts-answer">Yes</Button>
            <Button onClick={() => answer(false)} aria-disabled={atLeaf} className="lts-answer">No</Button>
            <Button onClick={startOver}>Start over</Button>
          </ControlGroup>
        </>,
        <ControlGroup key="inputs" label="Input a b c" inline>
          {INPUT_ORDERS.map((v) => (
            <ChipButton key={tripleText(v)} tone="info" on={sameTriple(values, v)} onClick={() => pickInput(v)}>
              {tripleText(v)}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="lts stage-pad">
        <WideRegion minWidth={TREE_W} label="Decision tree: scroll sideways to see all of it">
          <TreeSvg
            shape={SHAPE}
            layout="tidy"
            width={TREE_W}
            height={TREE_H}
            top={24}
            pad={44}
            levelGap={LEVEL_GAP}
            className="lts-tree"
            ariaLabel={`Decision tree for sorting a, b and c: ${f.answers.length} comparisons made, now at ${describe(here.id)}`}
            renderNode={(id) => <TreeBox id={id} />}
            nodeMark={(id) => {
              if (id === here.id) return { tone: atLeaf ? 'ok' : 'hi', fill: 'solid' };
              return onPath.has(id) ? { tone: 'violet', fill: 'tint', tint: 20 } : null;
            }}
            edgeMark={(p, c) => (onPath.has(p) && onPath.has(c) ? { tone: 'violet' } : null)}
            overlay={({ at }) => <EdgeLabels at={at} />}
          />
        </WideRegion>
        <div className="lts-bound">
          <Plot2D
            x={{ domain: [1, PLOT_N], label: 'items n' }}
            y={{ domain: [0, 400], label: 'comparisons' }}
            ariaLabel={`Lower bound ⌈log₂ n!⌉ against n log₂ n for n up to ${PLOT_N}: ${AT_MAX.bound} against ${AT_MAX.nlogn} at n = ${PLOT_N}`}
          >
            <Curve fn={(x) => x * Math.log2(x)} tone="violet" />
            <Curve points={SERIES.map((p) => [p.n, p.bound] as const)} tone="info" />
          </Plot2D>
          <div className="lts-bound-notes">
            <Legend
              items={[
                { color: 'var(--info)', label: '⌈log₂ n!⌉: fewest worst-case comparisons', shape: 'line' },
                { color: 'var(--violet)', label: 'n log₂ n', shape: 'line' },
              ]}
            />
            <Hint block>
              At n = {PLOT_N}: ⌈log₂ {PLOT_N}!⌉ = {AT_MAX.bound} (log₂ {PLOT_N}! ≈ {AT_MAX.log2.toFixed(3)}) against n log₂ n ={' '}
              {AT_MAX.nlogn}. The bound is n log₂ n − 1.44n plus smaller terms, so it grows at the same n log n rate.
            </Hint>
            <Hint block>
              Comparison counts are exact; the chart's n log₂ n is the leading term of the bound, not a measured sort.
            </Hint>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

function describe(id: string): string {
  const n = nodeOf(id);
  return n.kind === 'ask' ? `the question ${n.x} < ${n.y}` : `the leaf ${n.order.join(' < ')}`;
}

function TreeBox({ id }: { id: string }) {
  const n = nodeOf(id);
  const box = n.kind === 'ask' ? ASK_BOX : LEAF_BOX;
  return (
    <>
      <rect x={-box.w / 2} y={-box.h / 2} width={box.w} height={box.h} rx={n.kind === 'ask' ? 8 : 14} />
      <text y={5} textAnchor="middle">
        {n.kind === 'ask' ? `${n.x} < ${n.y}?` : n.order.join(' ')}
      </text>
    </>
  );
}

/** "yes" / "no" beside each edge, a third of the way down from the question. */
function EdgeLabels({ at }: { at: (id: string) => { x: number; y: number } | undefined }) {
  return (
    <g className="lts-edge-labels" aria-hidden="true">
      {ASKS.flatMap((id) => {
        const p = at(id);
        if (!p) return [];
        return childrenOf(id).map((c, k) => {
          const q = at(c);
          if (!q) return null;
          const x = p.x + (q.x - p.x) * 0.45 + (k === 0 ? -14 : 14);
          const y = p.y + (q.y - p.y) * 0.45;
          return (
            <text key={`${id}-${c}`} x={x} y={y} textAnchor="middle">
              {k === 0 ? 'yes' : 'no'}
            </text>
          );
        });
      })}
    </g>
  );
}


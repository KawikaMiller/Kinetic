import { useMemo, useState, type ReactNode } from 'react';
import type { GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { minVertexCover } from '../../core/vertexCover';
import { Chips } from './Chips';
import { FormulaEditor, FormulaLine } from './FormulaEditor';
import { GadgetGraph } from './GadgetGraph';
import { SAMPLE_COUNT, SAMPLE_SEED, buildGadget, seededFormulas, sweep, twoVariableFormulas, verdictOf, type Sweep } from './model';
import { EXHAUSTIVE_SCOPE, SAMPLED_SCOPE, sweepLine, verdictCaption } from './text';
import type { FormulaState } from './useFormula';

interface SweepRun {
  fixed: Sweep;
  dropped: Sweep;
}
const COVER_MARK: GraphNodeMark = { tone: 'hi', fill: 'solid' };

const runSweep = (formulas: Parameters<typeof sweep>[0]): SweepRun => ({ fixed: sweep(formulas), dropped: sweep(formulas, { variableEdges: false }) });

/** Scene 5: drop the variable edges and the same checks give a wrong verdict; the formula sets show how often. */
export function BreakScene({ picker, f }: { picker: ReactNode; f: FormulaState }) {
  const [dropped, setDropped] = useState(false);
  const [exhaustive, setExhaustive] = useState<SweepRun | null>(null);
  const [sampled, setSampled] = useState<SweepRun | null>(null);
  const variableEdges = !dropped;
  const g = useMemo(() => buildGadget(f.formula, { variableEdges }), [f.formula, variableEdges]);
  const verdict = useMemo(() => verdictOf(f.formula, { variableEdges }), [f.formula, variableEdges]);
  const best = useMemo(() => minVertexCover(g.vertexCount, g.edges), [g]);
  const cover = new Set(best.cover);
  const caption = verdictCaption(verdict, !dropped);

  return (
    <StageFrame
      height={380}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Exact minimum cover" value={verdict.minimum} sub={`K = ${verdict.K}`} />
          <Stat label="Satisfiable" value={verdict.satisfiable ? 'yes' : 'no'} sub="by trying every assignment" />
          <Stat label="Verdict" value={verdict.agrees ? 'right' : 'wrong'} color={verdict.agrees ? 'var(--ok)' : 'var(--bad)'} sub={verdict.rule ?? 'cover at most K exactly when satisfiable'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--hi)', label: 'in a minimum cover', shape: 'dot' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label="Variable edges" value={dropped} off="kept" on="dropped" onChange={setDropped} />
          <Button
            onClick={() => {
              setExhaustive(runSweep(twoVariableFormulas()));
            }}
          >
            Check all 793 two-variable formulas
          </Button>
          <Button onClick={() => setSampled(runSweep(seededFormulas(SAMPLE_SEED, SAMPLE_COUNT)))}>Check {SAMPLE_COUNT} seeded 3-variable formulas</Button>
        </>,
        <FormulaEditor key="editor" f={f} />,
      ]}
    >
      <div className="stage-pad npr-stage">
        <GadgetGraph g={g} mark={(v) => (cover.has(v) ? COVER_MARK : null)} ariaLabel={`Gadget graph ${dropped ? 'without' : 'with'} its variable edges, a minimum cover of ${best.size} marked`} />
        <div role="status" className="npr-results">
          {exhaustive ? (
            <>
              <Hint tone="muted" block>{sweepLine('With the variable edges', exhaustive.fixed, EXHAUSTIVE_SCOPE)}</Hint>
              <Hint tone={exhaustive.dropped.failures > 0 ? 'bad' : 'muted'} block>{sweepLine('Without them', exhaustive.dropped, EXHAUSTIVE_SCOPE)}</Hint>
            </>
          ) : null}
          {sampled ? (
            <>
              <Hint tone="muted" block>{sweepLine('With the variable edges', sampled.fixed, SAMPLED_SCOPE)}</Hint>
              <Hint tone={sampled.dropped.failures > 0 ? 'bad' : 'muted'} block>{sweepLine('Without them', sampled.dropped, SAMPLED_SCOPE)}</Hint>
            </>
          ) : null}
          {!exhaustive && !sampled && <Hint block>Press a check to count the formulas on which each graph gives the wrong verdict.</Hint>}
        </div>
        <FormulaLine formula={f.formula} />
      </div>
      <Chips sampled />
    </StageFrame>
  );
}

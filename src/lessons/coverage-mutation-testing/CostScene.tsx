import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { CodeView } from './CodeView';
import { VariantToggle, type SharedState } from './CoverageScene';
import { costCaption } from './captions';
import { SAMPLE_STEPS, countRuns, mutantsOnLines, sampleOf, scoreOf } from './cost';
import { analysisOf, programOf, report } from './suite';
import { printProgram } from './print';

const OPENING_PERCENT = 50;

export function CostScene({ picker, state }: { picker: ReactNode; state: SharedState }) {
  const { suite, variant } = state;
  const analysis = analysisOf(variant);
  const program = programOf(variant);
  const [percent, setPercent] = useState<number>(OPENING_PERCENT);
  const [changed, setChanged] = useState<number[]>([]);
  const setCaption = useSetCaption();

  const all = useMemo(() => countRuns(analysis, suite), [analysis, suite]);
  const sample = useMemo(() => sampleOf(analysis.mutants.length, percent), [analysis, percent]);
  const sampled = useMemo(() => countRuns(analysis, suite, sample), [analysis, suite, sample]);
  const touched = useMemo(() => mutantsOnLines(analysis, changed), [analysis, changed]);
  const incremental = useMemo(() => countRuns(analysis, suite, touched), [analysis, suite, touched]);
  const full = useMemo(() => report(analysis, suite), [analysis, suite]);
  const sampleScore = scoreOf(analysis, suite, sample);
  const executable = printProgram(program).map((l, i) => (l.anchor ? i : -1)).filter((i) => i >= 0);

  useEffect(() => {
    setCaption(costCaption(all, sampled, `A ${percent}% sample`), { quiet: true });
  }, [setCaption, all, sampled, percent]);

  const toggleLine = (i: number) => {
    if (!executable.includes(i)) return;
    setChanged(changed.includes(i) ? changed.filter((l) => l !== i) : [...changed, i]);
  };

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Every mutant, every test" value={all.naive} sub={`${all.mutants} × ${all.tests}`} color="var(--bad)" />
          <Stat label="Stop at first failing test" value={all.stopAtKill} sub="survivors still run every test" />
          <Stat label="Only tests that reach the code" value={all.coveringOnly} color="var(--ok)" sub="with the stop as well" />
          <Stat label={`${percent}% sample`} value={sampled.coveringOnly} sub={[`${sampled.mutants} mutants`, `score ${sampleScore === null ? 'n/a' : pct(sampleScore)} against ${full.score === null ? 'n/a' : pct(full.score)} in full`]} />
          <Stat label="Changed lines only" value={incremental.coveringOnly} sub={changed.length ? `${incremental.mutants} mutants` : 'pick lines below'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the costly side: every mutant against every test', shape: 'square' },
            { color: 'var(--ok)', label: 'the cheaper runs', shape: 'square' },
            { color: 'var(--hi)', label: 'a line you marked as changed', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Sample of mutants" value={percent} min={SAMPLE_STEPS[0]} max={100} step={5} onChange={setPercent} format={(v) => `${v}%`} />
          <VariantToggle variant={variant} setVariant={state.setVariant} />
        </>,
      ]}
    >
      <div className="cm stage-pad">
        <CodeView
          program={program}
          title="Click lines to mark them as changed since the last run"
          onLineClick={toggleLine}
          pressed={(i) => changed.includes(i)}
        />
        <p className="cm-note">
          The suite in use has {suite.cases.length} cases. Skipping a test that never runs the mutated code cannot change the result, so the covering-only count loses no kills; sampling and changed-lines runs do skip mutants, so their scores are estimates.
        </p>
        <div className="cm-notes">
          <Provenance kind="toy">runs are counted for this toy function; real tools differ in how they schedule and cache them</Provenance>
          <Hint block>The sample is a fixed seeded shuffle, so a bigger sample always contains a smaller one.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}

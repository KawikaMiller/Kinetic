import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { closedFormProcessed, runAgent, type Overflow } from './agent';
import { AUDIT_ANSWER, contextCaption } from './captions';
import { contextConfig } from './facts';
import { AUDIT_GOAL, BUDGET_MAX, BUDGET_MIN, BUDGET_STEP, CONTEXT_DEFAULT, STEPS_MAX, STEPS_MIN } from './settings';

const OVERFLOWS = [
  { value: 'truncate' as Overflow, label: 'Truncate the oldest' },
  { value: 'summarise' as Overflow, label: 'Summarise (keep goal and last result)' },
];
/** The audit task adds the same number of words every step, so the unclipped growth is a straight line. */
const NO_DROP_BUDGET = BUDGET_MAX * 10;

export function ContextScene({ picker }: { picker: ReactNode }) {
  const [stepBudget, setStepBudget] = useState<number>(CONTEXT_DEFAULT.stepBudget);
  const [budgetWords, setBudgetWords] = useState<number>(CONTEXT_DEFAULT.budgetWords);
  const [overflow, setOverflow] = useState<Overflow>(CONTEXT_DEFAULT.overflow);
  const cfg = useMemo(() => contextConfig({ stepBudget, budgetWords, overflow }), [stepBudget, budgetWords, overflow]);
  const run = useMemo(() => runAgent(cfg), [cfg]);
  const free = useMemo(() => runAgent(contextConfig({ stepBudget, budgetWords: NO_DROP_BUDGET })), [stepBudget]);
  const c0 = free.contextByStep[0];
  const d = free.contextByStep.length > 1 ? free.contextByStep[1] - free.contextByStep[0] : 0;
  const ifNothingDropped = closedFormProcessed(c0, d, free.steps);
  const caption = contextCaption(run, cfg, ifNothingDropped);
  const points = run.contextByStep.map((w, i) => [i + 1, w] as [number, number]);
  const yMax = Math.max(budgetWords, ...run.contextByStep, ...free.contextByStep) * 1.1;
  const correct = run.answer === AUDIT_ANSWER;
  const peak = Math.max(...free.contextByStep);

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Words processed" value={run.processed.toLocaleString('en-US')} color="var(--violet)" sub={[`the sum of the context at each of ${run.steps} calls`, `${ifNothingDropped.toLocaleString('en-US')} if nothing were dropped`]} />
          <Stat label="Goal in context" value={run.goalDroppedAtStep === null ? 'kept' : `dropped at step ${run.goalDroppedAtStep}`} color={run.goalDroppedAtStep === null ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Answer" value={run.answer === null ? 'none' : correct ? 'right' : 'a different question'} color={correct ? 'var(--ok)' : 'var(--bad)'} sub={run.answer ?? 'stopped: step budget reached'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'context words at each call', shape: 'line' },
            { color: 'var(--bad)', label: 'over the budget it is cut', shape: 'line' },
            { color: 'var(--dim)', label: 'the dropped goal, struck', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Step budget" value={stepBudget} min={STEPS_MIN} max={STEPS_MAX} onChange={setStepBudget} />
          <Slider label="Context budget" value={budgetWords} min={BUDGET_MIN} max={BUDGET_MAX} step={BUDGET_STEP} onChange={setBudgetWords} format={(v) => `${v} words`} />
        </>,
        <Segmented key="overflow" label="When it overflows" value={overflow} onChange={setOverflow} options={OVERFLOWS} />,
      ]}
    >
      <div className="ag-stage stage-pad">
        <Box>
          <SectionTitle hint={`audit task: "${AUDIT_GOAL}"`}>Every call resends the whole history</SectionTitle>
          <div className="ag-plot">
            <Plot2D x={{ domain: [1, STEPS_MAX], label: 'model call' }} y={{ domain: [0, yMax], label: 'words read' }} width={356} ariaLabel="Context words at each model call against the budget">
              <HLine at={budgetWords} tone="bad" label="budget" />
              <Curve points={points} tone="violet" />
              <Points data={points.map(([x, y]) => ({ x, y, tone: 'violet' as const, r: 3 }))} />
            </Plot2D>
          </div>
          <p className={`ag-goal ${run.goalDroppedAtStep === null ? '' : 'is-dropped'}`}>
            <b>goal</b> <span>{AUDIT_GOAL}</span>
            {run.goalDroppedAtStep !== null && <em> dropped from the context at step {run.goalDroppedAtStep}</em>}
          </p>
          <Hint tone="muted" block>The scripted policy reads the goal from its context. When the goal is gone it reports the latest result instead: a rule, shown as such, not a model's behaviour. With this step budget the audit's context peaks at {peak} words, so a context budget of {peak} or more never overflows and both options then give the same run.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="scripted">scripted policy, not an LLM; truncation and summary are stubs</Provenance>
          <Provenance kind="illustrative">word counts stand in for tokens; budgets are illustrative</Provenance>
          <Provenance kind="from-memory">prompt caching can reduce what is billed for a resent prefix: verify against your provider's docs</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

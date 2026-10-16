import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { runAgent } from './agent';
import { loopCaption } from './captions';
import { EventLog } from './EventLog';
import { loopConfig } from './facts';
import { BUDGET_MAX, BUDGET_MIN, BUDGET_STEP, LOOP_DEFAULT, LOOP_TASKS, STEPS_MAX, STEPS_MIN } from './settings';
import { loopPhase } from './view';

const PHASES = [
  { id: 'think', label: 'think', hint: 'the policy reads the context and decides' },
  { id: 'act', label: 'act', hint: 'a tool runs, or a guardrail stops it' },
  { id: 'observe', label: 'observe', hint: 'the result joins the context' },
] as const;

export function LoopScene({ picker }: { picker: ReactNode }) {
  const [task, setTask] = useState<string>(LOOP_DEFAULT.task);
  const [budgetWords, setBudgetWords] = useState<number>(LOOP_DEFAULT.budgetWords);
  const [stepBudget, setStepBudget] = useState<number>(LOOP_DEFAULT.stepBudget);
  const [picked, setPicked] = useState<number | null>(null);
  const run = useMemo(() => runAgent(loopConfig(task, { budgetWords, stepBudget })), [task, budgetWords, stepBudget]);
  const total = run.events.length;
  const shown = Math.min(picked ?? total, total);
  const event = run.events[shown - 1];
  const phase = loopPhase(event);
  const words = event?.contextWords ?? run.contextByStep[Math.max(0, run.events.slice(0, shown).filter((e) => e.phase === 'think').length - 1)] ?? 0;
  const label = LOOP_TASKS.find((t) => t.id === task)!.label;
  const caption = loopCaption(label, run, shown);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPicked(null); };

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Model calls" value={run.steps} sub={`step budget ${stepBudget}`} />
          <Stat label="Context now" value={`${words} / ${budgetWords}`} color="var(--violet)" sub="words, a stand-in for tokens" />
          <Stat label="Outcome" value={run.outcome === 'answered' ? 'answered' : run.outcome === 'paused' ? 'paused' : 'stopped'} color={run.outcome === 'answered' ? 'var(--ok)' : 'var(--bad)'} sub={run.outcome === 'stopped' ? 'stopped: step budget reached' : run.answer ?? ''} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the policy\'s thought', shape: 'square' },
            { color: 'var(--hi)', label: 'a tool call', shape: 'square' },
            { color: 'var(--ok)', label: 'a successful result', shape: 'square' },
            { color: 'var(--bad)', label: 'a failure or rejection', shape: 'square' },
            { color: 'var(--violet)', label: 'context words', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Task" inline>
            {LOOP_TASKS.map((t) => (
              <ChipButton key={t.id} tone="info" on={task === t.id} onClick={() => reset(setTask)(t.id)}>{t.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Slider label="Context budget" value={budgetWords} min={BUDGET_MIN} max={BUDGET_MAX} step={BUDGET_STEP} onChange={reset(setBudgetWords)} format={(v) => `${v} words`} />
          <Slider label="Step budget" value={stepBudget} min={STEPS_MIN} max={STEPS_MAX} onChange={reset(setStepBudget)} />
        </>,
        <>
          <Button onClick={() => setPicked(Math.max(1, shown - 1))} softDisabled={shown <= 1}>Previous event</Button>
          <Button variant="primary" onClick={() => setPicked(Math.min(total, shown + 1))} softDisabled={shown >= total}>Next event</Button>
          <Slider label="Event" value={shown} min={1} max={Math.max(1, total)} onChange={setPicked} />
        </>,
      ]}
    >
      <div className="ag-stage stage-pad">
        <Box>
          <SectionTitle hint="the loop around a scripted policy">think, act, observe</SectionTitle>
          <ol className="ag-phases">
            {PHASES.map((p) => (
              <li key={p.id} className={`ag-phase ${phase === p.id || (phase === 'answer' && p.id === 'think') ? 'is-now' : ''}`}>
                <b>{p.label}</b>
                <span>{p.hint}</span>
              </li>
            ))}
          </ol>
          <Bar value={words} max={budgetWords} tone={words > budgetWords ? 'bad' : 'violet'} label={<span className="ag-small">context window: {words} of {budgetWords} words</span>} ariaLabel={`${words} of ${budgetWords} words of context`} />
        </Box>
        <EventLog events={run.events} shown={shown} title="The loop's log" hint="a scripted policy, not a language model" />
        <ProvenanceRow>
          <Provenance kind="scripted">scripted policy, not an LLM: a rule table so every run is reproducible</Provenance>
          <Provenance kind="illustrative">invented orders and help pages; the outbox is fake and nothing is sent</Provenance>
          <Provenance kind="illustrative">word counts stand in for tokens; the budgets are illustrative</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

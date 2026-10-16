import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { runText } from './captions';
import { STRATEGY_TERMS } from './strategyTerms';
import { BUDGET_RANGE, finalTerm, MAX_SIZE, run, stepsOf, type Run, type Strategy } from './reduce';
import { print, termSize, parse, type Term } from './term';

const STRATEGIES: readonly Strategy[] = ['normal', 'applicative'];
const STRATEGY_LABEL: Record<Strategy, string> = { normal: 'Normal order', applicative: 'Applicative order' };
const DEFAULT_BUDGET = BUDGET_RANGE.max;
const SHOWN_CHARS = 70;

const termOf = (text: string): Term => {
  const p = parse(text);
  if (!p.ok) throw new Error(p.error);
  return p.term;
};
const TERMS = new Map(STRATEGY_TERMS.map((t) => [t.id, termOf(t.text)]));

/** Scene 4: the same term under both strategies, run with a budget and a size guard; certificates only where the terms repeat. */
export function StrategyScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [id, setId] = useState('const');
  const [budget, setBudget] = useState<number>(DEFAULT_BUDGET);
  const spec = STRATEGY_TERMS.find((t) => t.id === id) ?? STRATEGY_TERMS[0];
  const term = TERMS.get(spec.id)!;
  const runs = useMemo(() => Object.fromEntries(STRATEGIES.map((s) => [s, run(term, s, budget)])) as Record<Strategy, Run>, [term, budget]);

  useEffect(() => {
    setCaption(
      <>
        {spec.label}: {STRATEGIES.map((s) => `${STRATEGY_LABEL[s]}: ${runText(runs[s], s, budget)}`).join(' ')}
      </>,
      { quiet: true },
    );
  }, [setCaption, spec, runs, budget]);

  const shown = (t: Term) => (print(t).length > SHOWN_CHARS ? `${print(t).slice(0, SHOWN_CHARS)}…` : print(t));
  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          {STRATEGIES.map((s) => (
            <Stat
              key={s}
              label={STRATEGY_LABEL[s]}
              value={runs[s].end.kind === 'normal' ? `${stepsOf(runs[s])} steps` : runs[s].end.kind === 'loop' ? 'repeats' : runs[s].end.kind === 'too-big' ? 'too big' : `none within ${budget} steps`}
              color={runs[s].end.kind === 'normal' ? 'var(--ok)' : runs[s].end.kind === 'loop' ? 'var(--bad)' : 'var(--dim)'}
              sub={runs[s].end.kind === 'normal' ? 'reached a normal form' : runs[s].end.kind === 'budget' ? `within ${budget} steps` : undefined}
            />
          ))}
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'a normal form', shape: 'square' }, { color: 'var(--bad)', label: 'a certified repeat', shape: 'square' }, { color: 'var(--dim)', label: 'stopped at the budget or the size guard: not proved either way', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Term" value={id} onChange={setId} options={STRATEGY_TERMS.map((t) => ({ value: t.id, label: t.label }))} />
        </>,
        <>
          <Slider label="Step budget" value={budget} min={BUDGET_RANGE.min} max={BUDGET_RANGE.max} onChange={setBudget} />
        </>,
      ]}
    >
      <div className="ld stage-pad">
        <p className="ld-note">{spec.note}</p>
        <div className="ld-scroll" role="region" aria-label="Both strategies" tabIndex={0}>
          <table className="ld-table table-cards">
            <thead><tr><th scope="col">Strategy</th><th scope="col">What happened</th><th scope="col">Where it ended</th></tr></thead>
            <tbody>
              {STRATEGIES.map((s) => (
                <tr key={s}>
                  <th scope="row">{STRATEGY_LABEL[s]}</th>
                  <td data-label="What happened">{runText(runs[s], s, budget)}</td>
                  <td data-label="Where it ended"><code>{shown(finalTerm(runs[s]))}</code> ({termSize(finalTerm(runs[s]))} nodes)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Hint tone="muted">Normal order reduces the leftmost outermost redex; applicative order reduces the leftmost innermost one, so it works on arguments first. Given enough steps, a term that has a normal form is reached by normal order; applicative order can miss it. The size guard stops a term past {MAX_SIZE.toLocaleString('en-US')} nodes.</Hint>
        <ProvenanceRow>
          <Provenance kind="toy">a budget stop is "did not reach a normal form within N steps", not a verdict; only a term that comes back alpha-equal is certified as repeating</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

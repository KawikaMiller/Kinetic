import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { LAZY_DFA_VISIT_DEFINITION, VISIT_DEFINITION, fixesCaption, num } from './captions';
import { MAX_LETTERS, type Engine } from './engines';
import { BUDGETS, CAP_MAX, CAP_MIN, fixesOutcome, type RiskyId } from './fixes';
import { initialFixes } from './opening';
import { PATTERNS, anchored, patternById } from './patterns';

const RISKY = PATTERNS.filter((p) => p.id !== 'linear');
const ENGINES: { value: Engine; label: string }[] = [
  { value: 'backtracking', label: 'Backtracking' },
  { value: 'nfa', label: 'Linear-time NFA' },
  { value: 'lazy-dfa', label: 'Lazy DFA' },
];
const VERDICT_TEXT = { answered: 'answered: no match', 'cut-off': 'cut off at the budget, no answer', refused: 'refused at the boundary' } as const;
const VERDICT_COLOUR = { answered: 'var(--ok)', 'cut-off': 'var(--orange)', refused: 'var(--violet)' } as const;

/** Scene 3: the defender's list: a different engine, a rewritten pattern, a cap on input and a budget at the boundary. */
export function FixesScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialFixes);
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const outcome = fixesOutcome(state);
  const p = patternById(state.pattern);

  return (
    <StageFrame
      height={430}
      intro={fixesCaption(state, outcome)}
      introKey={[state.pattern, state.letters, state.engine, state.rewrite, state.capOn, state.cap, state.budget]}
      stats={
        <Stats>
          <Stat label="Visits" value={num(outcome.visits)} color={outcome.verdict === 'cut-off' ? 'var(--orange)' : 'var(--info)'} sub={outcome.verdict === 'refused' ? 'nothing was matched' : state.engine === 'lazy-dfa' ? 'lookups plus first-build state sizes: see below' : 'in this engine, same unit as the other scenes'} />
          <Stat label="The service" value={VERDICT_TEXT[outcome.verdict]} color={VERDICT_COLOUR[outcome.verdict]} sub={`${outcome.length} characters in`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'visits spent', shape: 'square' },
            { color: 'var(--ok)', label: 'answered', shape: 'square' },
            { color: 'var(--orange)', label: 'cut off at the budget', shape: 'square' },
            { color: 'var(--violet)', label: 'refused by the cap', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<RiskyId> label="Pattern" value={state.pattern} onChange={(v) => set({ pattern: v as RiskyId })} options={RISKY.map((r) => ({ value: r.id as RiskyId, label: r.shown }))} />
          <Segmented<Engine> label="Engine" value={state.engine} onChange={(v) => set({ engine: v })} options={ENGINES} />
        </>,
        <>
          <Slider label="Letters before the !" value={state.letters} min={1} max={MAX_LETTERS} onChange={(v) => set({ letters: v })} />
          <Toggle label="Rewrite without overlap" value={state.rewrite} onChange={(v) => set({ rewrite: v })} off={`Keep ${p.shown}`} on={`Use ${anchored(p.rewrite)}`} />
        </>,
        <>
          <Toggle label="Cap the input" value={state.capOn} onChange={(v) => set({ capOn: v })} />
          <Slider label="Longest input accepted" value={state.cap} min={CAP_MIN} max={CAP_MAX} onChange={(v) => set({ cap: v })} format={(v) => `${v} chars`} />
          <Segmented<number> label="Budget (backtracking only)" value={state.budget} onChange={(v) => set({ budget: v })} options={BUDGETS.map((b) => ({ value: b, label: num(b) }))} />
        </>,
      ]}
    >
      <div className="rd-stage stage-pad">
        <ConsolePanel
          title="what the service did"
          lines={[
            `pattern ${outcome.shown}`,
            `engine ${ENGINES.find((e) => e.value === state.engine)!.label}`,
            { text: VERDICT_TEXT[outcome.verdict], tone: outcome.verdict === 'answered' ? 'ok' : outcome.verdict === 'cut-off' ? 'orange' : 'violet' },
          ]}
        />
        <div className="rd-block">
          <SectionTitle>Visits spent, against the largest budget</SectionTitle>
          <Bar value={outcome.visits} max={Math.max(...BUDGETS)} color={outcome.verdict === 'cut-off' ? 'var(--orange)' : 'var(--info)'} />
        </div>
        <p className="rd-note">{VISIT_DEFINITION}</p>
        {state.engine === 'lazy-dfa' && <p className="rd-note">{LAZY_DFA_VISIT_DEFINITION}</p>}
        <div className="rd-block">
          <SectionTitle>The rest of the defender's list (not modelled here)</SectionTitle>
          <ul className="rd-list">
            <li>
              Atomic groups and possessive quantifiers stop the engine from backing into a repeat once it has finished. Some engines have them; JavaScript's <code>RegExp</code> does not. <Provenance kind="from-memory">verify against MDN</Provenance>
            </li>
            <li>
              A linear-time engine (RE2-style) trades away back-references and lookaround for a bound on the work. V8 has an experimental non-backtracking mode. <Provenance kind="from-memory">verify against each project's documentation</Provenance>
            </li>
            <li>Do not validate complex formats (email addresses, URLs) with one clever regex: use a parser written for the format.</li>
          </ul>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">the service, the request and the budget are the lesson's own model</Provenance>
        <Provenance kind="toy">a small matcher and a toy lazy DFA; real engines differ in how they count work</Provenance>
        <Provenance kind="from-memory">engine features named above come from memory: check each project's documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

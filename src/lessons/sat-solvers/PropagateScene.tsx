import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Toggle } from '../../components/ui';
import { startDpll, variableName, type DpllState } from '../../core/sat';
import { F2, backtrackWith, tryDeclareUnsat, tryDecide, tryStep, type Move, type SolverMode } from './model';
import { ClauseChips, Chips, Counters, TrailList } from './parts';
import { searchCaption } from './text';

const START: DpllState = startDpll(F2);
const VALUE_OPTIONS = [{ value: true, label: 'true' }, { value: false, label: 'false' }];
const NO_CONFLICT_REASON = 'nothing to undo: no conflict yet';

interface Run {
  /** Every state so far, oldest first; Undo drops the last. */
  history: DpllState[];
  note: string | null;
}
const FRESH: Run = { history: [START], note: null };

/** Scene 1: the learner drives DPLL on F2, deciding variables, stepping propagation and backtracking after a conflict. */
export function PropagateScene({ picker }: { picker: ReactNode }) {
  const [run, setRun] = useState<Run>(FRESH);
  const [value, setValue] = useState(true);
  const [mode, setMode] = useState<SolverMode>('correct');
  const state = run.history[run.history.length - 1];
  const caption = searchCaption(state, mode);

  const apply = (move: Move) =>
    setRun((r) => (move.ok ? { history: [...r.history, move.state], note: null } : { ...r, note: move.text }));
  const backtrack = () => setRun((r) => ({ history: [...r.history, backtrackWith(state, mode)], note: null }));

  return (
    <StageFrame
      height={360}
      intro={caption}
      introKey={caption}
      stats={<Counters state={state} />}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'clause satisfied', shape: 'square' },
            { color: 'var(--hi)', label: 'clause is unit: it forces a value', shape: 'square' },
            { color: 'var(--bad)', label: 'clause falsified', shape: 'square' },
            { color: 'var(--muted)', label: 'clause still open', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Solver" value={mode === 'broken'} off="correct" on="never flips (broken)" onChange={(b) => setMode(b ? 'broken' : 'correct')} />
        </>,
        <>
          <ControlGroup label="Decide a variable">
            {F2.names!.map((name, i) => {
              const v = i + 1;
              const now = state.values[v];
              return (
                <ChipButton key={name} tone="info" ariaLabel={`Decide ${name} ${value ? 'true' : 'false'}${now === null ? '' : `, already ${now ? 'true' : 'false'}`}`} onClick={() => apply(tryDecide(state, v, value))}>
                  {name}
                  {now === null ? '' : ` = ${now ? 'T' : 'F'}`}
                </ChipButton>
              );
            })}
          </ControlGroup>
          <Segmented label="Value" options={VALUE_OPTIONS} value={value} onChange={setValue} />
        </>,
        <>
          <Button variant="primary" onClick={() => apply(tryStep(state))}>Step</Button>
          <Button softDisabled={state.conflict === null} onClick={backtrack}>Backtrack</Button>
          <Button onClick={() => apply(tryDeclareUnsat(state))}>Declare UNSAT</Button>
          <Button softDisabled={run.history.length === 1} onClick={() => setRun((r) => ({ history: r.history.slice(0, -1), note: null }))}>Undo</Button>
          <Button onClick={() => setRun(FRESH)}>Reset</Button>
          {state.conflict === null && state.outcome === 'running' && <Hint>Backtrack: {NO_CONFLICT_REASON}</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad ss-stage">
        <ClauseChips cnf={F2} values={state.values} />
        <div role="status" className="ss-note">{run.note ? <Hint tone="bad" block>{run.note}</Hint> : <Hint block>Variables: {F2.names!.map((_, i) => `${variableName(F2, i + 1)} = ${state.values[i + 1] === null ? '?' : state.values[i + 1] ? 'T' : 'F'}`).join('  ')}</Hint>}</div>
        <TrailList cnf={F2} trail={state.trail} />
      </div>
      <Chips />
    </StageFrame>
  );
}

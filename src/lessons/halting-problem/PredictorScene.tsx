import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TapeStrip } from '../../components/TapeStrip';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { runTm, symbolAt } from '../../core/tm';
import { predictorCaption } from './captions';
import { LIBRARY, TRUTHS } from './machines';
import { answerPhrase, truthPhrase, verdictTone } from './phrases';
import {
  BUDGET_RANGE, canSayUnknown, DEFAULT_BUDGET, effective, KIND_LABEL, runD, scoreboard, usesBudget, type Predictor, type PredictorKind,
} from './predictors';

const KINDS: readonly PredictorKind[] = ['budget', 'cycle', 'alwaysLoops', 'alwaysHalts'];
const TAPE_VIEW_STEPS = 60;
const PHONE_CELLS = 9;
const DESKTOP_CELLS = 17;
const START: Predictor = { kind: 'budget', budget: DEFAULT_BUDGET, allowUnknown: false };

/** Scene 2: build a predictor from a menu, score it against eight real machines, and run D built from it. */
export function PredictorScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const phone = useMediaQuery(PHONE_QUERY);
  const [chosen, setChosen] = useState<Predictor>(START);
  const [showTape, setShowTape] = useState(false);
  const [tapeId, setTapeId] = useState('bb4');
  const [tapeStep, setTapeStep] = useState(0);

  const p = useMemo(() => effective(chosen), [chosen]);
  const board = useMemo(() => scoreboard(p), [p]);
  const d = useMemo(() => runD(p), [p]);

  useEffect(() => {
    setCaption(predictorCaption(p, board, d), { quiet: true });
  }, [setCaption, p, board, d]);

  const machine = LIBRARY.find((m) => m.id === tapeId) ?? LIBRARY[0];
  const truth = TRUTHS.get(machine.id)!;
  const tapeMax = truth.kind === 'halts' ? truth.steps : TAPE_VIEW_STEPS;
  const tapeRun = runTm(machine.tm, machine.input, { maxSteps: Math.min(tapeStep, tapeMax) });

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Right" value={`${board.right} of ${board.total}`} color="var(--ok)" />
          <Stat label="Wrong" value={board.wrong} color={board.wrong > 0 ? 'var(--bad)' : undefined} />
          <Stat label="Unanswered" value={board.unanswered} color={board.unanswered > 0 ? 'var(--dim)' : undefined} sub={`of ${board.total} inputs`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a right verdict', shape: 'square' },
            { color: 'var(--bad)', label: 'a wrong verdict, or a certified loop', shape: 'square' },
            { color: 'var(--dim)', label: 'UNKNOWN, or did not halt within N steps (not proved)', shape: 'square' },
            { color: 'var(--violet)', label: 'D', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Predictor" value={chosen.kind} onChange={(kind) => setChosen({ ...chosen, kind })} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        </>,
        <>
          {usesBudget(chosen.kind) && (
            <Slider label="N, steps to run" value={chosen.budget} min={BUDGET_RANGE.min} max={BUDGET_RANGE.max} onChange={(budget) => setChosen({ ...chosen, budget })} format={(v) => `${v}`} />
          )}
          {canSayUnknown(chosen.kind) && (
            <Toggle label="May answer UNKNOWN" value={chosen.allowUnknown} onChange={(allowUnknown) => setChosen({ ...chosen, allowUnknown })} off="No, always guess" on="Yes" />
          )}
          {!usesBudget(chosen.kind) && !canSayUnknown(chosen.kind) && <Hint tone="muted">This predictor ignores the machine, so it has nothing to set.</Hint>}
        </>,
        <>
          <Toggle label="Watch a machine’s tape" value={showTape} onChange={setShowTape} off="Hide" on="Show" />
        </>,
      ]}
    >
      <div className="hp stage-pad">
        <div className="hp-scroll" role="region" aria-label="Scoreboard" tabIndex={0}>
          <table className="hp-table">
            <thead>
              <tr><th scope="col">Machine</th><th scope="col">What it really does</th><th scope="col">The predictor says</th></tr>
            </thead>
            <tbody>
              {[...board.rows, board.d].map((r) => (
                <tr key={r.id} className={r.id === 'd' ? 'hp-d-row' : undefined}>
                  <th scope="row">{r.name}</th>
                  <td data-label="What it really does">{truthPhrase(r.truth)}</td>
                  <td data-label="The predictor says">
                    <span className={`hp-verdict tone-${verdictTone(r.answer.verdict, r.outcome === 'right')}`}>
                      {r.outcome === 'right' ? 'right' : r.outcome === 'wrong' ? 'wrong' : 'no claim'}
                    </span>{' '}
                    {answerPhrase(r.answer, { modelledD: r.id === 'd' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Box variant="sunken">
          <SectionTitle>D, built from this predictor</SectionTitle>
          <p className="hp-note">
            D(M) asks the predictor about M run on its own description, then does the opposite: it loops if told HALTS and halts at once otherwise. Run on its own description it asks about itself, so the predictor’s answer about D comes first, then D’s real behaviour, executed as one of two small machines and checked for a repeated configuration.
          </p>
          <p className="hp-note">
            Simulating D means simulating D’s own call to the predictor, which simulates D again, so a predictor that works by simulation never finishes within its limit and gives its limit answer. A predictor that does not simulate is caught by the same argument.
          </p>
        </Box>
        {showTape && (
          <Box>
            <SectionTitle hint="the machines are real and run here by the shared Turing machine code">Watch a machine run</SectionTitle>
            <Segmented label="Machine" value={tapeId} onChange={(id) => { setTapeId(id); setTapeStep(0); }} options={LIBRARY.map((m) => ({ value: m.id, label: m.name }))} />
            <Slider label="Step" value={Math.min(tapeStep, tapeMax)} min={0} max={tapeMax} onChange={setTapeStep} />
            <TapeStrip symbol={(i) => symbolAt(tapeRun.config, i)} head={tapeRun.config.head} state={tapeRun.config.state} cells={phone ? PHONE_CELLS : DESKTOP_CELLS} />
            <Hint tone="muted">{truth.kind === 'halts' ? `This machine halts after ${truth.steps} steps.` : `Shown up to step ${TAPE_VIEW_STEPS} of a machine that loops.`}</Hint>
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="toy">toy predictors from a menu; the library is eight real machines run here</Provenance>
          <Provenance kind="from-memory">the busy-beaver values (6, 21 and 107 steps) are known results, here checked by running the machines: verify against the literature</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

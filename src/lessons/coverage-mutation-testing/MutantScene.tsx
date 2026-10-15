import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Hint, Legend, Provenance, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { CodeView } from './CodeView';
import { VariantToggle, type SharedState } from './CoverageScene';
import { mutantCaption, scorePct } from './captions';
import { CLASS_LABEL } from './mutants';
import { addCase, analysisOf, killingTest, report, type Status } from './suite';

const STATUS_WORD: Record<Status, string> = { killed: 'killed', survived: 'survived', equivalent: 'equivalent', 'not-run': 'not run' };
const STATUS_TONE: Record<Status, string> = { killed: 'ok', survived: 'bad', equivalent: 'dim', 'not-run': 'muted' };

export function MutantScene({ picker, state }: { picker: ReactNode; state: SharedState }) {
  const { suite, variant } = state;
  const analysis = analysisOf(variant);
  const r = useMemo(() => report(analysis, suite), [analysis, suite]);
  const [selected, setSelected] = useState(0);
  const [onlySurvivors, setOnlySurvivors] = useState(false);
  const setCaption = useSetCaption();
  const verdict = r.verdicts[selected];
  const suggestion = killingTest(analysis, selected);

  useEffect(() => {
    setCaption(mutantCaption(analysis, selected, verdict, suite), { quiet: true });
  }, [setCaption, analysis, selected, verdict, suite]);

  const addKilling = () => {
    if (!suggestion) return;
    const next = addCase({ ...suite, mode: 'exact' }, suggestion);
    if (next.ok) state.setSuite(next.suite);
  };
  const rows = r.verdicts.map((v, i) => ({ v, i })).filter(({ v }) => !onlySurvivors || v.status === 'survived');
  const canAdd = verdict.status === 'survived' && suggestion !== null;

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Killed" value={r.killed} color="var(--ok)" />
          <Stat label="Survived" value={r.survived} color="var(--bad)" />
          <Stat label="Equivalent" value={r.equivalent} color="var(--dim)" sub="left out of the score" />
          <Stat label="Mutation score" value={scorePct(r)} sub={r.baselinePasses ? `killed ÷ (${r.total} − ${r.equivalent})` : 'suite fails on the code'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'the token the mutation changed', shape: 'square' },
            { color: 'var(--ok)', label: 'killed', shape: 'square' },
            { color: 'var(--bad)', label: 'survived', shape: 'square' },
            { color: 'var(--dim)', label: 'equivalent: ruled out of the score', shape: 'square' },
            { color: 'var(--hi)', label: 'a test that would kill the survivor', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Show" value={onlySurvivors} onChange={setOnlySurvivors} off="all mutants" on="survivors only" />
          <VariantToggle variant={variant} setVariant={state.setVariant} />
        </>,
        <ControlGroup key="suite" label="Suite in use">
          <Hint tone="muted">
            {suite.cases.length} cases, assertion: {suite.mode === 'exact' ? 'exact value' : suite.mode === 'weak' ? 'returns a number' : 'none'}. Edit it in the first scene, or add the killing test below.
          </Hint>
        </ControlGroup>,
      ]}
    >
      <div className="cm stage-pad">
        <div className="cm-split">
          <CodeView program={analysis.mutants[selected].program} marks={analysis.mutants[selected].marks} title={`${analysis.mutants[selected].id}: the mutated code`} />
          <Box className="cm-suggest">
            <SectionTitle hint={CLASS_LABEL[analysis.mutants[selected].cls]}>{analysis.mutants[selected].id}</SectionTitle>
            <p className={`cm-status is-${STATUS_TONE[verdict.status]}`}>{STATUS_WORD[verdict.status]}</p>
            {verdict.status === 'survived' &&
              (suggestion ? (
                <p className="cm-hint">
                  A test at weight <b>{suggestion.weight}</b>, express <b>{String(suggestion.express)}</b>, expecting <b>{suggestion.expected}</b>, would kill it. The expected value is what the code returns now: check it is what you mean.
                </p>
              ) : (
                <p className="cm-hint">No input in the domain tells it from the code.</p>
              ))}
            <Button variant="primary" disabled={!canAdd} onClick={addKilling}>
              Add this test
            </Button>
          </Box>
        </div>

        <table className="data-table cm-mutants">
          <caption className="cm-sr">Mutants of cost: pick one to see its code</caption>
          <thead>
            <tr>
              <th>Mutant</th>
              <th>Change</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ v, i }) => (
              <tr key={v.mutant.id} className={`cm-row ${i === selected ? 'is-selected' : ''} is-${v.status}`}>
                <td data-label="Mutant">
                  <button type="button" className="cm-pick" aria-pressed={i === selected} onClick={() => setSelected(i)}>
                    {v.mutant.id} · {CLASS_LABEL[v.mutant.cls]}
                  </button>
                </td>
                <td data-label="Change">
                  <code>{v.mutant.before}</code> → <code>{v.mutant.after}</code>
                </td>
                <td data-label="Result">
                  <span className={`chip tone-${STATUS_TONE[v.status]}`}>{STATUS_WORD[v.status]}</span>
                  {v.killedBy !== null && <span className="cm-by"> by case {v.killedBy + 1}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="cm-notes">
          <Provenance kind="toy">{r.total} mutants from five operator classes; real tools have dozens and smarter equivalence handling</Provenance>
          <Provenance kind="from-memory">class names echo tools such as Stryker, PIT and mutmut</Provenance>
          <Hint block>
            A mutant is equivalent when it behaves like the code for every input checked here (weights 0 to 40, both values of express); it is found by running both over that whole domain.
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}

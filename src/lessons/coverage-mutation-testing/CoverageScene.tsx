import { useEffect, useMemo, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { CasesEditor } from './CasesEditor';
import { CodeView } from './CodeView';
import { coverageCaption, intentNote, scorePct } from './captions';
import { coverageOf } from './coverage';
import { PRESETS, type PresetId } from './presets';
import { MODE_LABEL, analysisOf, programOf, report, type CodeVariant, type Mode, type Suite } from './suite';

const MODES: Mode[] = ['exact', 'weak', 'none'];

export interface SharedState {
  suite: Suite;
  variant: CodeVariant;
  setSuite: (s: Suite) => void;
  setVariant: (v: CodeVariant) => void;
  applyPreset: (id: PresetId) => void;
  /** Which preset (if any) the suite and code still match, to light its chip. */
  activePreset: PresetId | null;
}

/** The code variant and suite controls every scene shows, because they feed every number. */
export function VariantToggle({ variant, setVariant }: Pick<SharedState, 'variant' | 'setVariant'>) {
  return <Toggle label="Code" value={variant === 'buggy'} onChange={(b) => setVariant(b ? 'buggy' : 'cost')} off="cost as intended" on="cost with an off-by-one" />;
}

export function CoverageScene({ picker, state }: { picker: ReactNode; state: SharedState }) {
  const { suite, variant } = state;
  const program = programOf(variant);
  const analysis = analysisOf(variant);
  const cov = useMemo(() => coverageOf(program, suite.cases), [program, suite]);
  const r = useMemo(() => report(analysis, suite), [analysis, suite]);
  const setCaption = useSetCaption();

  useEffect(() => {
    setCaption(coverageCaption(suite, cov, r), { quiet: true });
  }, [setCaption, suite, cov, r]);

  const intent = r.baselinePasses ? intentNote(suite) : null;

  return (
    <StageFrame
      height={540}
      stats={
        <Stats>
          <Stat label="Line coverage" value={cov.lineCount ? pct(cov.linesCovered / cov.lineCount) : 'n/a'} color="var(--info)" sub={`${cov.linesCovered} of ${cov.lineCount} lines`} />
          <Stat label="Branch coverage" value={cov.branchCount ? pct(cov.branchesCovered / cov.branchCount) : 'n/a'} color="var(--info)" sub={`${cov.branchesCovered} of ${cov.branchCount} branches`} />
          <Stat
            label="Mutation score"
            value={scorePct(r)}
            color={r.score === null ? 'var(--muted)' : r.score === 1 ? 'var(--ok)' : 'var(--bad)'}
            sub={r.baselinePasses ? `${r.killed} of ${r.total - r.equivalent} killed` : 'suite fails on the code'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'line that ran', shape: 'square' },
            { color: 'var(--dim)', label: 'line nothing reached', shape: 'square' },
            { color: 'var(--ok)', label: 'every killable mutant killed', shape: 'square' },
            { color: 'var(--bad)', label: 'survivors remain', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Suites to try">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="violet" on={state.activePreset === p.id} onClick={() => state.applyPreset(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented label="Assertion" value={suite.mode} onChange={(mode) => state.setSuite({ ...suite, mode })} options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
          <VariantToggle variant={variant} setVariant={state.setVariant} />
        </>,
      ]}
    >
      <div className="cm stage-pad">
        <div className="cm-split">
          <CodeView program={program} coverage={cov} title="cost, printed from its expression tree" />
          <CasesEditor suite={suite} onSuite={state.setSuite} />
        </div>
        {intent && (
          <Box variant="sunken" className="cm-warn" role="note">
            <SectionTitle>The snapshot trap</SectionTitle>
            <p>
              This suite passes on this code, and {intent}. A suite approved from the code's own output kills mutants of the code as it is, bugs included.
            </p>
          </Box>
        )}
        <div className="cm-notes">
          <Provenance kind="real">the evaluator runs for real in your browser, with no eval</Provenance>
          <Provenance kind="toy">a toy function and a few mutation operators; real tools have dozens and smarter equivalence handling</Provenance>
          <Hint block>Executable lines are the {cov.lineCount} that hold code; the function header and closing brace are not counted.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}

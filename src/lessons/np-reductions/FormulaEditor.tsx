import { Button, ChipButton, ControlGroup, Hint, Segmented, TextField } from '../../components/ui';
import { LIMITS, PRESETS, formulaText, type Formula } from './model';
import type { FormulaState } from './useFormula';

const VARIABLE_OPTIONS = Array.from({ length: LIMITS.maxVars }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

/** The formula the graph is built from, as the reduction reads it. */
export function FormulaLine({ formula }: { formula: Formula }) {
  return <p className="npr-formula mono">{formulaText(formula)}</p>;
}

/** The formula controls of every scene that reduces the learner's formula: presets, variable count, typed text. */
export function FormulaEditor({ f }: { f: FormulaState }) {
  return (
    <>
      <ControlGroup label="Formula">
        {PRESETS.map((p) => (
          <ChipButton key={p.id} on={f.presetId === p.id} onClick={() => f.load(p.id)}>
            {p.label}
          </ChipButton>
        ))}
      </ControlGroup>
      <Segmented label="Variables" ariaLabel="Number of variables" options={VARIABLE_OPTIONS} value={f.formula.vars} onChange={f.setVars} />
      <TextField label="Type a formula" value={f.text} onChange={f.setText} onEnter={f.apply} spellCheck={false} className="npr-formula-field" />
      <Button onClick={f.apply}>Use this formula</Button>
      {f.error ? (
        <Hint tone="bad" block>{f.error}</Hint>
      ) : (
        <Hint block>
          Three literals to a clause, at most {LIMITS.maxVars} variables and {LIMITS.maxClauses} clauses. Join clauses with &quot;and&quot;; a short clause repeats a literal.
        </Hint>
      )}
    </>
  );
}

import { useState } from 'react';
import { F1, PRESETS, formulaText, parseFormula, withVariables, type Formula } from './model';

export interface FormulaState {
  formula: Formula;
  /** The preset loaded, or null once the learner has typed a formula of their own. */
  presetId: string | null;
  text: string;
  error: string | null;
  /** A stable string for `key` and `introKey`: changes exactly when the formula does. */
  key: string;
  setText: (text: string) => void;
  apply: () => void;
  load: (presetId: string) => void;
  setVars: (vars: number) => void;
}

/** The formula the lesson reduces: typed text read through `parseFormula`, presets, and the variable count. */
export function useFormula(): FormulaState {
  const [formula, setFormula] = useState<Formula>(F1);
  const [presetId, setPresetId] = useState<string | null>(PRESETS[0].id);
  const [text, setText] = useState(formulaText(F1));
  const [error, setError] = useState<string | null>(null);

  const adopt = (f: Formula, id: string | null) => {
    setFormula(f);
    setPresetId(id);
    setText(formulaText(f));
    setError(null);
  };

  return {
    formula,
    presetId,
    text,
    error,
    key: `${formula.vars}:${formulaText(formula)}`,
    setText,
    apply: () => {
      const read = parseFormula(text, formula.vars);
      if (read.ok) adopt(read.formula, PRESETS.find((p) => p.formula.vars === read.formula.vars && formulaText(p.formula) === formulaText(read.formula))?.id ?? null);
      else setError(`${read.error} Keeping the current formula.`);
    },
    load: (id) => {
      const preset = PRESETS.find((p) => p.id === id);
      if (preset) adopt(preset.formula, preset.id);
    },
    setVars: (vars) => {
      const read = withVariables(formula, vars);
      if (read.ok) adopt(read.formula, presetId);
      else setError(`${read.error} Keeping ${formula.vars} variables.`);
    },
  };
}

import { parseGrammar, type Grammar } from './grammar';

export interface GrammarPreset {
  id: string;
  label: string;
  text: string;
  /** A token string that shows the grammar off. */
  sample: string;
  note: string;
}

export const PRESETS: GrammarPreset[] = [
  {
    id: 'layered',
    label: 'Layered expressions',
    text: 'E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id',
    sample: 'id + id * id',
    note: 'One layer per precedence level, left-recursive: natural for a bottom-up parser.',
  },
  {
    id: 'll',
    label: 'LL-friendly expressions',
    text: "E -> T E'\nE' -> + T E' | eps\nT -> F T'\nT' -> * F T' | eps\nF -> ( E ) | id",
    sample: 'id + id * id',
    note: 'The same language with the left recursion rewritten away: a top-down parser can predict from one token.',
  },
  {
    id: 'ambiguous',
    label: 'Ambiguous',
    text: 'E -> E + E | E * E | id',
    sample: 'id + id * id',
    note: 'No layers, so nothing says which operator binds tighter: the parse needs a rule from you.',
  },
  {
    id: 'dangling',
    label: 'Dangling else',
    text: 'S -> i S | i S e S | a',
    sample: 'i i a e a',
    note: 'i is if-then, e is else, a is any other statement: which if does the else belong to?',
  },
];

/** The preset's grammar, parsed (the presets are fixed text, so a failure is a bug). */
export function presetGrammar(id: string): Grammar {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`no preset ${id}`);
  const parsed = parseGrammar(preset.text);
  if (!parsed.ok) throw new Error(`${id}: ${parsed.error}`);
  return parsed.value;
}

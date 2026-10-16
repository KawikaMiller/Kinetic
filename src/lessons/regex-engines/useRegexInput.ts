import { useState } from 'react';
import { parsePattern, parseSubject, type ParsedRegex } from './regexParse';
import { BACKREF_REFUSAL } from './thompson';

export interface RegexInput {
  patternText: string;
  subjectText: string;
  /** The last pattern that parsed: what the scene draws and runs while the typed text is refused. */
  parsed: ParsedRegex;
  /** The last subject that was accepted, as characters. */
  subject: string[];
  patternError: string | null;
  subjectError: string | null;
  setPatternText: (text: string) => void;
  setSubjectText: (text: string) => void;
  /** Replace both fields (a preset). */
  load: (pattern: string, subject: string) => void;
}

interface State {
  patternText: string;
  subjectText: string;
  parsed: ParsedRegex;
  subject: string[];
  patternError: string | null;
  subjectError: string | null;
}

export const AUTOMATON_REFUSAL = `Back-references: ${BACKREF_REFUSAL} The backtracking scene handles them.`;

/** One reading of a pattern field: the parse, or the reason it is refused (a scene that draws an automaton also refuses a back-reference). */
function readPattern(text: string, automaton: boolean): { ok: true; value: ParsedRegex } | { ok: false; error: string } {
  const r = parsePattern(text);
  if (r.ok && automaton && r.value.usesBackref) return { ok: false, error: AUTOMATON_REFUSAL };
  return r;
}

function initial(pattern: string, subject: string, automaton: boolean): State {
  const p = readPattern(pattern, automaton);
  const s = parseSubject(subject);
  if (!p.ok || !s.ok) throw new Error(`default input must be valid: ${pattern} / ${subject}`);
  return { patternText: pattern, subjectText: subject, parsed: p.value, subject: s.value, patternError: null, subjectError: null };
}

/**
 * A pattern field and a subject field that each keep their last good value while the typed text is refused
 * with its reason. `automaton` scenes draw a state machine, so a pattern with a back-reference is refused there.
 */
export function useRegexInput(pattern: string, subject: string, { automaton }: { automaton: boolean }): RegexInput {
  const [state, setState] = useState(() => initial(pattern, subject, automaton));
  const setPatternText = (text: string) =>
    setState((prev) => {
      const r = readPattern(text, automaton);
      return r.ok ? { ...prev, patternText: text, parsed: r.value, patternError: null } : { ...prev, patternText: text, patternError: r.error };
    });
  const setSubjectText = (text: string) =>
    setState((prev) => {
      const r = parseSubject(text);
      return r.ok ? { ...prev, subjectText: text, subject: r.value, subjectError: null } : { ...prev, subjectText: text, subjectError: r.error };
    });
  return { ...state, setPatternText, setSubjectText, load: (p, s) => setState(initial(p, s, automaton)) };
}

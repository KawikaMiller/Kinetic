/**
 * The fixed pairs the "which match?" scene compares with the browser's real regex engine. The engine runs
 * ONLY on these lesson-authored literals, never on anything the learner types.
 */
export interface WhichExample {
  pattern: string;
  subject: string;
  /** What `RegExp.prototype.exec` returned for the pair, or null for no match. */
  real: { text: string; index: number } | null;
}

const realOf = (m: RegExpExecArray | null): WhichExample['real'] => (m ? { text: m[0], index: m.index } : null);

export const WHICH_EXAMPLES: WhichExample[] = [
  { pattern: 'a|ab', subject: 'ab', real: realOf(/a|ab/.exec('ab')) },
  { pattern: 'ab|a', subject: 'ab', real: realOf(/ab|a/.exec('ab')) },
  { pattern: '(a|ab)c?', subject: 'abc', real: realOf(/(a|ab)c?/.exec('abc')) },
  { pattern: 'x*', subject: 'axx', real: realOf(/x*/.exec('axx')) },
];

/** The real result for this pair when it is one of the fixed examples, otherwise undefined (nothing was run). */
export function realResultFor(pattern: string, subject: string): WhichExample['real'] | undefined {
  return WHICH_EXAMPLES.find((e) => e.pattern === pattern && e.subject === subject)?.real;
}

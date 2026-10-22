/** Every number the lesson text quotes, computed once from the model at each scene's opening state. */
import { counterNumbers, num, shapeRows } from './captions';
import { BUDGET, backtrackVisits, letters, parseText } from './engines';
import { fixesOutcome } from './fixes';
import { growthDetail } from './growth';
import { COUNTER_MAX, COUNTER_PATTERN, SHAPES_FROM, SHAPES_TO, initialCounter, initialFixes, initialShapes } from './opening';
import { PATTERNS, anchored, patternById } from './patterns';

const counter = initialCounter();
const opening = counterNumbers(counter.letters);
/** The fewest letters at which the counter pattern gives up at the budget. */
const gaveUpAt = Array.from({ length: COUNTER_MAX }, (_, i) => i + 1).find((n) => backtrackVisits(COUNTER_PATTERN, letters(n)).gaveUp)!;
const atGaveUp = counterNumbers(gaveUpAt);

const shapes = initialShapes();
const typed = parseText(shapes.text);
if (!typed.ok) throw new Error('the default text must parse');
const own = Object.fromEntries(PATTERNS.map((p) => [p.id, backtrackVisits(p.source, typed.value).visits])) as Record<string, number>;
const growth = Object.fromEntries(shapeRows().map((r) => [r.id, r.growth]));

const fixes = initialFixes();
const exp = patternById(fixes.pattern);

export const FACTS = {
  budget: num(BUDGET),
  counterPattern: anchored(COUNTER_PATTERN),
  counterLetters: counter.letters,
  counterVisits: opening.bt.visits,
  counterNfa: opening.nfa.visits,
  counterRatio: opening.ratio!.toFixed(2),
  gaveUpAt,
  gaveUpNfa: atGaveUp.nfa.visits,
  from: SHAPES_FROM,
  to: SHAPES_TO,
  kinds: Object.fromEntries(Object.entries(growth).map(([id, g]) => [id, g.kind])) as Record<string, string>,
  fibRatio: (growth.fibonacci as { ratio: number }).ratio.toFixed(2),
  expRatio: (growth.exponential as { ratio: number }).ratio.toFixed(2),
  quadDetail: growthDetail(growth.quadratic),
  ownLength: typed.value.length,
  own,
  fixesLetters: fixes.letters,
  fixesVerdict: fixesOutcome(fixes).verdict,
  rewriteShown: anchored(exp.rewrite),
  rewriteVisits: fixesOutcome({ ...fixes, rewrite: true }).visits,
  nfaVisits: fixesOutcome({ ...fixes, engine: 'nfa' }).visits,
  lazyVisits: fixesOutcome({ ...fixes, engine: 'lazy-dfa' }).visits,
  cap: fixes.cap,
  capUnderVisits: fixesOutcome({ ...fixes, letters: 15, capOn: true }).visits,
  capVerdict: fixesOutcome({ ...fixes, capOn: true }).verdict,
};


/** Numbers the try-this, key ideas and quiz quote, read off the model at the default state. */
import { classifyScore } from '../../core/classify';
import { KEY, SNIPPETS } from './classification';
import { OPENING } from './opening';
import { asWritten, assumingNoOverflow, defenceOutcome, differingInputs, rangeOf, retarget, sanitizerMessage, withCheck, type IntType } from './ub';

const O = OPENING.overflow;
const eight: IntType = { width: 8, signed: true };
const eightUnsigned: IntType = { width: 8, signed: false };
const ids = SNIPPETS.map((s) => ({ id: s.id, label: s.code }));
const firstOnly = Object.fromEntries(SNIPPETS.map((s, i) => [s.id, i === 0 ? KEY[s.id] : null]));

export const FACTS = {
  max32: rangeOf(O.type).max,
  writtenAtMax: asWritten(O.x, O.type),
  assumedAtMax: assumingNoOverflow(O.x, O.type),
  wrapped32To8: retarget(O.x, O.type, eight).x,
  space8: 2 ** 8,
  max8: rangeOf(eight).max,
  differing8: differingInputs(eight).length,
  differing8Unsigned: differingInputs(eightUnsigned).length,
  nullAgree: withCheck(OPENING.pointer.address),
  total: SNIPPETS.length,
  firstOnlyRight: classifyScore(ids, KEY, firstOnly),
  sanitizer: sanitizerMessage(OPENING.defence.x),
  wrapvResult: defenceOutcome('wrapv', OPENING.defence.x).result,
  noneResult: defenceOutcome('none', OPENING.defence.x).result,
};

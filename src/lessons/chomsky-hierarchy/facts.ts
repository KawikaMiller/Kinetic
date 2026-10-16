/** Every number the lesson text quotes, computed from the model. */
import { EVIDENCE, evidenceFor } from './evidence';
import { cardById, decide, KEY } from './languages';
import { EXAMPLES, distinguishing, finalPartition, refine } from './minimize';
import { OPENING } from './opening';
import { cfCount, chooseString, playGame, pumpLanguage } from './pumping';

const anbn = cardById('anbn');
const tester = decide(cardById(OPENING.rings.tester.card), OPENING.rings.tester.input)!;
const ww = decide(cardById('ww'), 'abab')!;
const wrongRegular = evidenceFor(anbn, 'regular').lines[0];

const defaults = OPENING.pumping;
const anbnLang = pumpLanguage('anbn');
const open = chooseString(anbnLang, defaults.shape, defaults.n, defaults.p);
if (!open.ok) throw new Error(open.error);
const openGame = playGame(anbnLang, open.s, defaults.p, defaults.mode);

const abstar = pumpLanguage('abstar');
const abstarSetup = chooseString(abstar, 'abn', defaults.n, defaults.p);
if (!abstarSetup.ok) throw new Error(abstarSetup.error);
const abstarGame = playGame(abstar, abstarSetup.s, defaults.p, 'regular');

const equal = pumpLanguage('equal');
const poor = chooseString(equal, 'abn', defaults.n, defaults.p);
if (!poor.ok) throw new Error(poor.error);
const poorGame = playGame(equal, poor.s, defaults.p, 'regular');

const cs = pumpLanguage('anbncn');
const csGame = playGame(cs, 'aaabbbccc', 3, 'cf');

const mod3 = EXAMPLES.find((e) => e.id === OPENING.minimise.example)!.dfa;
const rounds = refine(mod3);

export const FACTS = {
  ringCount: 5,
  cardCount: Object.keys(KEY).length,
  counterEvidence: wrongRegular,
  testerCard: OPENING.rings.tester.card,
  testerInput: OPENING.rings.tester.input,
  testerDetail: tester.detail,
  wwDetail: ww.detail,
  p: defaults.p,
  openString: open.s,
  openSplits: openGame.rows.length,
  openWon: openGame.won,
  abstarString: abstarSetup.s,
  abstarSurviving: abstarGame.surviving.length,
  abstarSplits: abstarGame.rows.length,
  poorString: poor.s,
  poorWon: poorGame.won,
  poorSurvivingY: poorGame.surviving.map((r) => r.decomposition.pieces[1]).filter((y, i, all) => all.indexOf(y) === i),
  csCount: cfCount(9, 3),
  csWon: csGame.won,
  evidenceCfP: EVIDENCE.cfP,
  mod3States: mod3.states.length,
  mod3Classes: finalPartition(mod3).count,
  mod3Rounds: rounds.length - 1,
  mod3Separator: distinguishing(mod3, 's1', 's2')!,
  mod3Equivalent: distinguishing(mod3, 's0', 's3') === null,
};

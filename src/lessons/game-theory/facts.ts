import {
  BATTLE_OF_THE_SEXES, CLASSIC_DILEMMA, MATCHING_PENNIES, PRISONERS_DILEMMA, claimCell, dilemmaGame, enumerateGames, flips, fracText, mixed2x2, noEquilibriumVerdict,
  pureEquilibria,
} from './model';

const e = enumerateGames();
const bos = mixed2x2(BATTLE_OF_THE_SEXES);
const mp = mixed2x2(MATCHING_PENNIES);
const fmt = (n: number) => n.toLocaleString('en-US');
const cooperative = dilemmaGame({ ...CLASSIC_DILEMMA, R: 1 });

/** The numbers the presets and the enumeration put in the summary, try-this and quiz. All come from the model. */
export const FACTS = {
  total: fmt(e.total),
  noPure: fmt(e.noPure),
  mixedValid: fmt(e.mixedValid),
  brokenDiffers: fmt(e.brokenDiffers),
  brokenPercent: ((e.brokenDiffers / e.total) * 100).toFixed(1),
  histogram: e.histogram.map(fmt).join(', '),
  pdClaimCC: claimCell(PRISONERS_DILEMMA, 0, 0).message,
  pdClaimDD: claimCell(PRISONERS_DILEMMA, 1, 1).message,
  pdEquilibria: pureEquilibria(PRISONERS_DILEMMA).length,
  pdSecondEquilibria: pureEquilibria(cooperative).length,
  mpVerdict: noEquilibriumVerdict(MATCHING_PENNIES).message,
  mpP: mp.kind === 'mixed' ? fracText(mp.p) : '',
  bosP: bos.kind === 'mixed' ? fracText(bos.p) : '',
  bosQ: bos.kind === 'mixed' ? fracText(bos.q) : '',
  bosValue: bos.kind === 'mixed' ? fracText(bos.rowValue) : '',
  bosPure: pureEquilibria(BATTLE_OF_THE_SEXES).length,
  flipsAtOne: flips({ ...CLASSIC_DILEMMA, R: 1 }).length,
};

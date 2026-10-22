/** Every number the lesson text quotes, computed from the model at the states the try-this entries walk through. */
import { decimal } from '../../core/format';
import {
  DEFAULT_STAGES, LENIENT, SIGMA_B, SIGMA_B_ANCHORED, SINGLE_CANDIDATE_SKILL, correlationFormula, effectiveInterviewers, expectedSpread, interviewerRows, makeFunnelDraws, makeInterviewerDraws, makePool, passChance,
  recallFormula, runFunnel, runPanel, spreadOf, type Panel, type StageSpec,
} from './model';
import { DEFAULT_SEED, OPENING } from './opening';

const d2 = (x: number): string => decimal(x, 2);
const pctWhole = (share: number): number => Math.round(share * 100);
const base = OPENING.panel;
const panelOf = (k: number, rho = 0, sigma = base.sigma): Panel => ({ k, sigma, rho });
const hire = base.hire / 100;
const pool = makePool(DEFAULT_SEED);
const atDefault = runPanel(pool, panelOf(base.k), hire);
const NO_PHONE: StageSpec[] = DEFAULT_STAGES.map((s, i) => (i === 1 ? { ...s, noSignal: true } : s));
const funnel = runFunnel(makeFunnelDraws(DEFAULT_SEED), DEFAULT_STAGES);
const funnelNoPhone = runFunnel(makeFunnelDraws(DEFAULT_SEED), NO_PHONE);
const interviewers = makeInterviewerDraws(DEFAULT_SEED);
const spreadLoose = spreadOf(interviewerRows(interviewers, SIGMA_B));
const spreadTight = spreadOf(interviewerRows(interviewers, SIGMA_B_ANCHORED));
/** The quiz's fixed panel: one interview with an error of 1, and four with errors that move together. */
const ONE_AT_ONE = panelOf(1, 0, 1);
const AGREEING_FOUR = panelOf(4, 0.5, 1);

export const FACTS = {
  seed: DEFAULT_SEED,
  k: base.k,
  sigma: base.sigma,
  hire: base.hire,
  rDefault: d2(correlationFormula(panelOf(base.k))),
  recallDefault: pctWhole(recallFormula(correlationFormula(panelOf(base.k)), hire)),
  recallDefaultPool: pctWhole(atDefault.recallPool),
  missDefault: pctWhole(1 - recallFormula(correlationFormula(panelOf(base.k)), hire)),
  rK1: d2(correlationFormula(panelOf(1))),
  recallK1: pctWhole(recallFormula(correlationFormula(panelOf(1)), hire)),
  rK9: d2(correlationFormula(panelOf(9))),
  recallK9: pctWhole(recallFormula(correlationFormula(panelOf(9)), hire)),
  rRho: d2(correlationFormula(panelOf(3, 0.5))),
  recallRho: pctWhole(recallFormula(correlationFormula(panelOf(3, 0.5)), hire)),
  effectiveRho: decimal(effectiveInterviewers(panelOf(3, 0.5)), 1),
  oneRecall: pctWhole(recallFormula(correlationFormula(ONE_AT_ONE), hire)),
  oneR: d2(correlationFormula(ONE_AT_ONE)),
  fourR: d2(correlationFormula(panelOf(4, 0, 1))),
  fourAgreeingR: d2(correlationFormula(AGREEING_FOUR)),
  fourAgreeingEffective: decimal(effectiveInterviewers(AGREEING_FOUR), 1),
  funnelRecall: d2(funnel[2].recall),
  funnelMean: d2(funnel[2].meanSkill),
  funnelNoPhoneRecall: d2(funnelNoPhone[2].recall),
  funnelNoPhoneMean: d2(funnelNoPhone[2].meanSkill),
  spreadLoose: d2(spreadLoose),
  spreadTight: d2(spreadTight),
  expectedLoose: d2(expectedSpread(SIGMA_B)),
  expectedTight: d2(expectedSpread(SIGMA_B_ANCHORED)),
  lenientChance: decimal(passChance(SINGLE_CANDIDATE_SKILL, LENIENT) * 100, 1),
  neutralChance: decimal(passChance(SINGLE_CANDIDATE_SKILL, 0) * 100, 1),
  strictChance: decimal(passChance(SINGLE_CANDIDATE_SKILL, -LENIENT) * 100, 1),
} as const;

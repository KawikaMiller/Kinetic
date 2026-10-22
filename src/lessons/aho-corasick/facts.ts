import { DEFAULT_PATTERNS, DEFAULT_TEXT, bfsOrder, brokenReport, buildMachine, naiveScan, runMachine } from './model';

const machine = buildMachine(DEFAULT_PATTERNS);
const ushers = runMachine(machine, DEFAULT_TEXT);
const hishers = runMachine(machine, 'hishers');
const naive = naiveScan(DEFAULT_PATTERNS, DEFAULT_TEXT);
const broken = brokenReport();
const where = (m: { pattern: string; start: number; end: number }) => `${m.pattern} at ${m.start} to ${m.end}`;
const states = machine.trie.states;

/** The numbers the default patterns and texts put in the summary, try-this and quiz. All come from the model. */
export const FACTS = {
  patterns: DEFAULT_PATTERNS.join(', '),
  text: DEFAULT_TEXT,
  stateCount: states.length,
  ushersMatches: ushers.matches.map(where).join(', '),
  ushersCount: ushers.matches.length,
  ushersReads: ushers.reads,
  ushersFollows: ushers.follows,
  ushersNaive: naive.compared,
  hishersMatches: hishers.matches.map(where).join(', '),
  hishersReads: hishers.reads,
  hishersFollows: hishers.follows,
  /** BFS order of the states the by-hand scene offers, as 'id string' labels. */
  linkOrder: bfsOrder(machine.trie).slice(1).map((id) => `${id} (${states[id].string})`).join(', '),
  shFail: states[machine.fail[4]].string,
  sheFail: states[machine.fail[5]].string,
  sheFailState: machine.fail[5],
  witnessMissed: broken.witness.missed.map(where).join(', '),
  brokenFailing: broken.failing,
  brokenCases: broken.cases,
};

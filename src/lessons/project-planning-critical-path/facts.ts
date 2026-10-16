/** Every number the lesson text quotes, computed from the model at the default state. */
import { sig } from '../../core/format';
import { BROOKS_DEFAULT, readBrooks } from './brooks';
import { BASE, crashOf } from './crash';
import { PRESET, addEdge, cpm, setDays } from './cpm';
import { OPENING } from './opening';
import { listSchedule, lowerBounds, optimalMakespan } from './schedule';
import { MERGE_DEMO, expectedMaxClosedForm, simulateProject } from './uncertainty';

const cycle = addEdge(PRESET, OPENING.path.from, OPENING.path.to);
const uiSlip = cpm(setDays(PRESET, 'ui', 6));
const apiCut = crashOf('api', -3);
const uiSlipThree = cpm(setDays(PRESET, 'ui', PRESET.tasks.find((t) => t.id === 'ui')!.days + 3));
const n = OPENING.people.engineers;
const brooks = readBrooks(BROOKS_DEFAULT);
const risk = simulateProject(PRESET, OPENING.risk.sigma, OPENING.risk.seed);
const label = (id: string) => PRESET.tasks.find((t) => t.id === id)!.label;

export const FACTS = {
  length: BASE.length,
  tasks: PRESET.tasks.length,
  critical: BASE.critical.length,
  chain: [...BASE.critical].sort((a, b) => BASE.es[a] - BASE.es[b]).map(label).join(', '),
  uiSlack: BASE.slack.ui,
  uiSlipLength: uiSlip.length,
  uiSlipThreeMoves: uiSlipThree.length - BASE.length,
  polishSlackAfterSlip: uiSlip.slack.polish,
  apiCutLength: apiCut.after.length,
  apiSaved: BASE.length - apiCut.after.length,
  apiCutNaive: BASE.length + apiCut.delta,
  newlyCritical: apiCut.newlyCritical.map(label).join(' and '),
  cycleError: cycle.ok ? '' : cycle.error,
  engineers: n,
  listMakespan: listSchedule(PRESET, n).makespan,
  workShare: lowerBounds(PRESET, n).workShare,
  criticalPath: lowerBounds(PRESET, n).criticalPath,
  optimum: optimalMakespan(PRESET, n),
  oneEngineer: listSchedule(PRESET, 1).makespan,
  brooksOne: sig(brooks.days[0], 3),
  brooksBest: brooks.best,
  brooksBestDays: sig(brooks.days[brooks.best - 1], 4),
  brooksLaterAt: brooks.laterAt,
  riskMean: sig(risk.meanLength, 3),
  apiCriticality: Math.round(risk.criticality.api * 100),
  schemaCriticality: Math.round(risk.criticality.schema * 100),
  mergeClosed: sig(expectedMaxClosedForm(MERGE_DEMO.mean, MERGE_DEMO.sd), 4),
} as const;

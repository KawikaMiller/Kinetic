import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { dominatedPaths, duplicatePaths, type Scenario } from './scenario';
import { LEAD_SCENARIOS } from './testing/leadScenarios';
import { MIGRATION } from '../lessons/strangler-fig-migrations/scenario';
import { PRICE_RISE } from '../lessons/build-vs-buy/scenario';
import { PROPOSAL } from '../lessons/design-docs-rfcs/proposal';
import { MANAGER } from '../lessons/estimation/scenario';
import { SCENARIOS } from '../lessons/incident-response/model';
import { FEEDBACK } from '../lessons/mentoring-delegation/scenario';
import { CHOOSE } from '../lessons/ml-fairness-bias/scenario';
import { STAKEHOLDER } from '../lessons/prioritization/scenario';
import { SPRINT } from '../lessons/threat-modeling/sprint';

it('probe', () => {
  const all: Record<string, Scenario> = {
    ...LEAD_SCENARIOS, 'L:MIGRATION': MIGRATION, 'L:PRICE_RISE': PRICE_RISE, PROPOSAL, MANAGER,
    ...Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => ['incident:' + k, v])), FEEDBACK, CHOOSE, STAKEHOLDER, SPRINT,
  };
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(all)) out[k] = { dom: dominatedPaths(s).map((p) => p.detail), cross: dominatedPaths(s, { crossEndings: true }).length, dup: duplicatePaths(s).length };
  writeFileSync('C:/Users/Hawai/AppData/Local/Temp/claude/K--Programming-personalProjects/60e952a3-6f6e-4d52-b227-6526f33e5564/scratchpad/probe.json', JSON.stringify(out, null, 1));
});

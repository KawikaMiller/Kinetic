/** Scene 2 and 3's rows and captions, pure so tests can read them. */
import { SCENARIOS, verdict, type Outcome, type Plan, type ScenarioId, type Verdict } from './plan';
import { clock } from './backup';
import { minutesText } from './view';

export interface PlanRow {
  id: ScenarioId;
  label: string;
  story: string;
  verdict: Verdict;
}

export const planRows = (plan: Plan, seed: number): PlanRow[] => SCENARIOS.map((s) => ({ id: s.id, label: s.label, story: s.story, verdict: verdict(plan, s.id, seed) }));

export function planCaption(row: PlanRow, survived: number, total: number): string {
  const v = row.verdict;
  const head = `${row.label}: ${v.ok ? `recoverable, ${minutesText(v.lostMin!)} of data lost and about ${minutesText(v.downtimeMin!)} down` : `not recoverable, because ${v.why}`}.`;
  return `${head} This plan survives ${survived} of ${total} scenarios.`;
}

export function outcomeText(o: Outcome): string {
  return o.restored ? `Restored to ${clock(o.reached)}, ${minutesText(o.lostMin)} of data lost: ${o.why}.` : `The restore failed: ${o.why}.`;
}

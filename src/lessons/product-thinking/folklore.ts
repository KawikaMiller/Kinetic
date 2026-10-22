/**
 * Scene 4: a folk number ("most features are rarely or never used") and the measurement that would settle it for
 * one's own product. An INVENTED seeded population shows how the design of the measurement, not the product, can
 * decide the answer.
 */
import { mulberry32 } from '../../core/random';

export const POPULATION_SEED = 5;
export const SIGNUPS = 1000;
export const ACTIVE = 400;
/** The feature's natural cycle: a monthly usage report. */
export const CYCLE_DAYS = 30;
/** Invented: share of active users who use the feature once in a cycle, and who open its page without using it. */
export const USE_SHARE = 0.5;
export const VIEW_SHARE = 0.7;

export interface Person {
  id: number;
  active: boolean;
  /** Day (0 to CYCLE_DAYS - 1) of the use, or null. */
  usedOn: number | null;
  /** Day of a page view without use, or null. */
  viewedOn: number | null;
}

export function population(seed = POPULATION_SEED): Person[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: SIGNUPS }, (_, id) => {
    const active = id < ACTIVE;
    const day = () => Math.floor(rnd() * CYCLE_DAYS);
    return {
      id,
      active,
      usedOn: active && rnd() < USE_SHARE ? day() : null,
      viewedOn: active && rnd() < VIEW_SHARE ? day() : null,
    };
  });
}

export type LogChoice = 'views' | 'uses';
export type WindowChoice = 7 | 30 | 90;
export type CohortChoice = 'signups' | 'active';

export const LOGS: { value: LogChoice; label: string; counts: string }[] = [
  { value: 'views', label: 'Page views of the report page', counts: 'opening the page, whether or not anything was done with it' },
  { value: 'uses', label: 'Report generated and downloaded', counts: 'finishing the task the feature exists for' },
];
export const WINDOWS: { value: WindowChoice; label: string }[] = [
  { value: 7, label: '1 week' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];
export const COHORTS: { value: CohortChoice; label: string; counts: string }[] = [
  { value: 'signups', label: 'Everyone who ever signed up', counts: `${SIGNUPS} accounts, including ones that never came back` },
  { value: 'active', label: 'Teams active in the last 30 days', counts: `${ACTIVE} accounts that still use the product` },
];

export interface Design {
  log: LogChoice;
  window: WindowChoice;
  cohort: CohortChoice;
}

export const DESIGN_DEFAULT: Design = { log: 'views', window: 7, cohort: 'signups' };

/** Share of the chosen cohort with a qualifying event inside the window. The data covers one cycle, so a window past it adds nothing. */
export function measured(people: readonly Person[], d: Design): number {
  const cohort = people.filter((p) => d.cohort === 'signups' || p.active);
  const hit = cohort.filter((p) => {
    const used = p.usedOn !== null && p.usedOn < d.window;
    const viewed = p.viewedOn !== null && p.viewedOn < d.window;
    return d.log === 'uses' ? used : used || viewed;
  });
  return hit.length / cohort.length;
}

export interface Check {
  ok: boolean;
  text: string;
}

/** What each choice does to what is being counted, from the tables above (not an opinion about the right answer). */
export function checks(d: Design): Check[] {
  return [
    d.log === 'uses'
      ? { ok: true, text: 'Counts finished uses, which is what "used" usually means for this feature.' }
      : { ok: false, text: 'Counts page views too, so opening the page counts as use; a different definition of "used" gives a different answer.' },
    d.window >= CYCLE_DAYS
      ? { ok: true, text: `The window covers the feature's ${CYCLE_DAYS}-day cycle, so a monthly user is seen.` }
      : { ok: false, text: `The window is ${d.window} days against the feature's ${CYCLE_DAYS}-day cycle, so a monthly user has about a ${Math.round((100 * d.window) / CYCLE_DAYS)}% chance of being caught in it.` },
    d.cohort === 'active'
      ? { ok: true, text: 'Counts accounts that still use the product, the people the feature is for.' }
      : { ok: false, text: 'Counts accounts that never came back, which cannot use any feature and drag the share down.' },
  ];
}

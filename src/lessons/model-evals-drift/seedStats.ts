/**
 * How the input monitors behave across many seeded streams, not just the default seed. The scenes expose a
 * seed field, so a claim about "the monitors fire / stay silent" has to hold as a rate over seeds.
 */
import { alarms, shiftDayOf, simulate, type DriftSetting } from './stream';

export const SEED_STREAMS = 200;
/** A covariate shift counts as detected when an input monitor fires this many days or fewer after it starts (day 20 to day 22). */
export const DETECT_WITHIN_DAYS = 2;

const SHIFT_DAY = 20;
const COVARIATE_PCT = 80;
const CONCEPT_PCT = 60;

export interface SeedStats {
  streams: number;
  /** Covariate shift: streams whose input monitors fire within DETECT_WITHIN_DAYS of the shift. */
  covariateDetected: number;
  /** Concept drift: streams whose input monitors fire at any day from the shift on. */
  conceptInputAlert: number;
  /** Streams (either kind: the days before the shift are identical) with an input alert before the shift. */
  falseBeforeShift: number;
}

const stream = (kind: DriftSetting['kind'], sizePct: number, seed: number) => {
  const setting: DriftSetting = { kind, day: SHIFT_DAY, sizePct, seed, labelDelay: 0 };
  return alarms(simulate(setting), 0, shiftDayOf(setting));
};

/** Seeds 1 to `streams`, shift on day 20. */
export function measureSeeds(streams = SEED_STREAMS): SeedStats {
  const out: SeedStats = { streams, covariateDetected: 0, conceptInputAlert: 0, falseBeforeShift: 0 };
  for (let seed = 1; seed <= streams; seed++) {
    const cov = stream('covariate', COVARIATE_PCT, seed);
    const con = stream('concept', CONCEPT_PCT, seed);
    if (cov.input !== null && cov.input <= SHIFT_DAY + DETECT_WITHIN_DAYS) out.covariateDetected++;
    if (con.input !== null) out.conceptInputAlert++;
    if (cov.falseInputDays > 0) out.falseBeforeShift++;
  }
  return out;
}

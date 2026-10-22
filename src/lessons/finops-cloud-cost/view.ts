import { dollars, pctText } from '../../core/format';
import {
  BREAK_EVEN_READS, HOURS, P_C, PRESETS, bill, burstPrice, dayCost, optimumByScan, peakNeed, requestsPerDay, spotAllowed, transfer, type Profile, type Tier, type Work, type Zones,
} from './cost';

export const OPENING = { preset: 'web', committed: 0, work: 'user', spot: false, hour: 0, rps: 100 } as const;
export const WEB: Profile = PRESETS.web.profile;
/** Scenes 2 and 3 take their request volume from the web profile and their compute reference from its cheapest commitment. */
export const WEB_OPTIMUM = optimumByScan(WEB);
export const BYTES_OPENING = { zones: 3 as Zones, sameZone: 0 };
export const BILL_OPENING = { committed: 4, zones: 3 as Zones, sameZone: 0, tier: 'standard' as Tier, readsTenths: 12 };

const money = (x: number) => dollars(x);

export function dayCaption(profile: Profile, committed: number, spot: boolean): string {
  const peak = peakNeed(profile);
  if (requestsPerDay(profile) === 0) {
    return `No traffic: there is no cost per request to show. Paid capacity costs ${money(dayCost(profile, committed, spot).total)} per illustrative day.`;
  }
  const here = dayCost(profile, committed, spot);
  const none = dayCost(profile, 0, spot).total;
  const best = optimumByScan(profile, spot);
  const head = `Committing ${committed} of ${peak} instances costs ${money(here.total)} per day, ${money(here.perMillion ?? 0)} per million requests, with ${pctText(here.utilisation ?? 0, 1)} of the paid capacity used.`;
  const against = committed > 0 && here.total > none + 1e-9 ? ` This costs more than committing nothing (${money(none)}).` : '';
  return `${head}${against} The cheapest level for this profile is ${best}.`;
}

export function bytesCaption(requests: number, zones: Zones, sameZone: number): string {
  const t = transfer(requests, zones, sameZone);
  const compute = dayCost(WEB, WEB_OPTIMUM).total;
  const versus = t.cost > compute
    ? `more than the ${money(compute)} of compute at the cheapest commitment`
    : `${pctText(t.cost / compute, 0)} of the ${money(compute)} of compute at the cheapest commitment`;
  return `At ${zones} zones with ${pctText(sameZone, 0)} of calls kept in-zone, ${Math.round(t.crossingGb).toLocaleString('en-US')} of ${t.gb.toLocaleString('en-US')} GB cross a zone boundary per day, costing ${money(t.cost)}: ${versus}.`;
}

export function billCaption(committed: number, zones: Zones, sameZone: number, tier: Tier, fullReads: number): string {
  const b = bill(WEB, committed, zones, sameZone, tier, fullReads);
  const gap = fullReads - BREAK_EVEN_READS;
  const side = Math.abs(gap) < 1e-9 ? 'two tiers cost the same' : gap < 0 ? 'colder tier is cheaper' : 'standard tier is cheaper';
  return `Compute ${money(b.compute)} + transfer ${money(b.transfer)} + storage ${money(b.storage)} = ${money(b.total)} per day, ${b.perMillion === null ? 'no traffic' : `${money(b.perMillion)} per million requests`}. At ${fullReads.toFixed(1)} full reads per GB-month the ${side} (they tie at ${BREAK_EVEN_READS.toFixed(2)}).`;
}

/** Hours of the day a level must be needed for a commitment at it to pay: committed price over the burst price, times the day. */
export const breakEvenHours = (spot: boolean): number => (HOURS * P_C) / burstPrice(spot);

/** The rule of thumb under the cost curve, derived from the burst price: it says so when no level can reach the break-even. */
export function commitRule(spot: boolean): string {
  const hours = breakEvenHours(spot);
  const price = dollars(burstPrice(spot));
  if (hours >= HOURS) {
    return `Interruptible capacity costs ${price} per useful hour against ${dollars(P_C)} for a committed one, so a commitment would have to be used for ${hours.toFixed(1)} hours to pay, more than the ${HOURS} in a day: committing does not pay, and the cheapest level is 0.`;
  }
  return `Commit up to the level the profile reaches for more than ${hours.toFixed(1)} of the ${HOURS} hours (${pctText(hours / HOURS, 0)} of the day): that is where a committed hour at ${dollars(P_C)} costs less than a burst hour at ${price}.`;
}

export const spotReason = (work: Work): string | null => {
  const s = spotAllowed(work);
  return s.ok ? null : s.reason;
};

export const HOURS_LABEL = `${HOURS} hours`;

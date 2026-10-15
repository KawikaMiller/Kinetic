import { plural } from '../../core/format';
import { CLASS_LABEL, CLIENTS, rowFor, type Change } from './api';
import { CHOICES, addDays, ANNOUNCE_DATE, simulate, type Choice } from './sunset';
import { STRATEGIES, cacheRun, fateOf, liveVersions, versionInHeader, yearlyCost, type StrategyId } from './strategies';

/** Captions as plain text, computed from the same runs the screen shows. */

const names = (ids: readonly string[]) => (ids.length < 2 ? ids.join('') : `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`);
const labelOf = (id: string) => CLIENTS.find((c) => c.id === id)!.label;

export function changeCaption(change: Change, name: string): string {
  const row = rowFor(change, name);
  const broken = CLIENTS.filter((c) => row.cells[c.id].status === 'broken');
  const changed = CLIENTS.filter((c) => row.cells[c.id].status === 'changed');
  const parts: string[] = [];
  if (broken.length) parts.push(`breaks ${broken.length} of ${CLIENTS.length} clients (${names(broken.map((c) => `${c.label}: ${row.cells[c.id].reason}`))})`);
  if (changed.length) parts.push(`silently changes the result for ${names(changed.map((c) => c.label))}`);
  if (!parts.length) parts.push('leaves all four clients working');
  return `${change.label}: ${parts.join(', and ')}. Verdict: ${CLASS_LABEL[row.cls]}.`;
}

export function strategyCaption(strategy: StrategyId, change: Change, name: string, sendVary: boolean, releasesPerYear: number, migrationMonths: number): string {
  const label = STRATEGIES.find((s) => s.id === strategy)!.label;
  const fate = fateOf(strategy, change, name);
  const cache = cacheRun(strategy, sendVary);
  const cacheText =
    strategy === 'additive'
      ? 'There is one representation, so a shared cache cannot serve the wrong version'
      : cache.correct
        ? 'A shared cache keeps the two versions apart'
        : `A shared cache serves the v2 client the v1 body${versionInHeader(strategy) ? ', because the response does not say it varies by the version header' : ''}`;
  const live = liveVersions(strategy, releasesPerYear, migrationMonths);
  return `${label}. ${fate.text} ${cacheText}. With ${plural(releasesPerYear, 'release')} a year and ${plural(migrationMonths, 'month')} to migrate, up to ${plural(live, 'version')} stay live, about ${yearlyCost(live)} engineer-days a year (an illustrative figure).`;
}

export function sunsetCaption(windowDays: number, choice: Choice): string {
  const o = simulate(windowDays, choice);
  const left = o.clients.filter((c) => c.onOldAtSunset).map((c) => labelOf(c.id));
  const choiceLabel = CHOICES.find((c) => c.id === choice)!.label.toLowerCase();
  const date = addDays(ANNOUNCE_DATE, o.sunsetDay);
  const who = left.length ? `${plural(left.length, 'client')} (${names(left)}) still on the old version when it goes` : 'every client has migrated before it goes';
  const planned = o.plannedClientHours ? ` The brownouts cost ${plural(o.plannedClientHours, 'client-hour')} of planned failure.` : '';
  return `${plural(windowDays, 'day')} between announcement and sunset, and you ${choiceLabel}: the old version goes on ${date}, and ${who}.${planned}`;
}

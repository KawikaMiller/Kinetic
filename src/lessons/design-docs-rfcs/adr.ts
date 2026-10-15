/**
 * The architecture decision record the chosen option writes: title, status, context, decision,
 * consequences, in the five-part layout many teams use. The text is rebuilt from state every
 * time, so changing the option changes the consequences. An accepted record is read-only:
 * changing a decision means writing a new record that supersedes the old one.
 */
import { optionOf, violated, type ConstraintId, type Option, type OptionId } from './decision';

export type Status = 'proposed' | 'accepted' | 'superseded';

export const TITLE_MAX = 80;

export interface Adr {
  number: number;
  title: string;
  optionId: OptionId;
  status: Status;
  /** The record this one replaces. */
  supersedes: number | null;
  /** The record that replaced this one. */
  supersededBy: number | null;
}

export const OPENING_TITLE = 'Speed up the slow profile page';

export const draftAdr = (optionId: OptionId): Adr => ({ number: 1, title: OPENING_TITLE, optionId, status: 'proposed', supersedes: null, supersededBy: null });

/** A title as it will be stored: plain text, trimmed. Null when empty or over 80 characters. It is rendered as text, never as markup. */
export function cleanTitle(raw: string): string | null {
  const t = raw.trim();
  return t.length >= 1 && t.length <= TITLE_MAX ? t : null;
}

export const READ_ONLY_MESSAGE = 'An accepted ADR is superseded by a new one, not edited.';

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/** Change a proposed record's title or option; an accepted or superseded one refuses. */
export function edit(adr: Adr, patch: Partial<Pick<Adr, 'title' | 'optionId'>>): Result<Adr> {
  if (adr.status !== 'proposed') return { ok: false, message: READ_ONLY_MESSAGE };
  return { ok: true, value: { ...adr, ...patch } };
}

/** Accepting an option that breaks a must-have constraint that is switched on is refused. */
export function acceptBlocked(optionId: OptionId, on: readonly ConstraintId[]): string | null {
  const broken = violated(optionOf(optionId), on);
  return broken.length === 0 ? null : `${optionOf(optionId).name} breaks a must-have constraint (${broken.map((c) => c.label).join(', ')}): choose another option first.`;
}

/** Move to a status. Only proposed to accepted is allowed here, and only with a title. */
export function setStatus(adr: Adr, status: Status): Result<Adr> {
  if (status === adr.status) return { ok: true, value: adr };
  if (status === 'superseded') return { ok: false, message: 'A record is superseded by writing its replacement: use Supersede.' };
  if (adr.status !== 'proposed') return { ok: false, message: READ_ONLY_MESSAGE };
  if (cleanTitle(adr.title) === null) return { ok: false, message: `Give it a title of 1 to ${TITLE_MAX} characters before accepting.` };
  return { ok: true, value: { ...adr, status } };
}

/** Write the next record, linked to this one, which becomes superseded. Only an accepted record can be superseded. */
export function supersede(history: readonly Adr[], number: number, optionId: OptionId, title: string): Result<Adr[]> {
  const old = history.find((a) => a.number === number);
  if (!old || old.status !== 'accepted') return { ok: false, message: 'Only an accepted ADR is superseded; a proposed one can simply be edited.' };
  const next: Adr = { number: Math.max(...history.map((a) => a.number)) + 1, title, optionId, status: 'proposed', supersedes: old.number, supersededBy: null };
  return { ok: true, value: [...history.map((a) => (a.number === old.number ? { ...a, status: 'superseded' as const, supersededBy: next.number } : a)), next] };
}

const baseline = optionOf('nothing');

const fmt = (n: number) => n.toLocaleString('en-US');

/** What the chosen option gives, compared with doing nothing, read off its own numbers. */
export function benefits(o: Option): string[] {
  const out: string[] = [];
  if (o.values.latency < baseline.values.latency) out.push(`p95 latency falls from ${baseline.values.latency} ms to ${o.values.latency} ms.`);
  if (o.id === 'nothing') out.push('Nothing is built, so nothing new has to be run or kept consistent.');
  return out;
}

/** What it costs: every criterion where it is worse than doing nothing, plus the latency left. */
export function costs(o: Option): string[] {
  const out: string[] = [];
  if (o.values.cost > baseline.values.cost) out.push(`Running cost rises by $${fmt(o.values.cost - baseline.values.cost)} a month.`);
  if (o.values.staleness > baseline.values.staleness) out.push(`Profile data can be up to ${o.values.staleness} s stale.`);
  if (o.values.effort > baseline.values.effort) out.push(`It takes about ${o.values.effort} weeks of effort.`);
  if (o.id === 'nothing') out.push(`p95 latency stays at ${o.values.latency} ms.`);
  return out;
}

/** The record as text, one line per entry, rebuilt from state. */
export function adrLines(adr: Adr, history: readonly Adr[] = []): string[] {
  const o = optionOf(adr.optionId);
  const title = cleanTitle(adr.title) ?? '(no title yet)';
  const link = adr.supersedes !== null ? ` Supersedes ADR ${adr.supersedes}.` : adr.supersededBy !== null ? ` Superseded by ADR ${adr.supersededBy}.` : '';
  const prior = history.find((a) => a.number === adr.supersedes);
  return [
    `# ADR ${adr.number}: ${title}`,
    '',
    `Status: ${adr.status}.${link}`,
    '',
    '## Context',
    `The profile page has a p95 latency of ${baseline.values.latency} ms.${prior ? ` ADR ${prior.number} chose "${optionOf(prior.optionId).name}" and is being replaced.` : ''}`,
    '',
    '## Decision',
    `We will ${o.id === 'nothing' ? 'do nothing for now' : o.name.charAt(0).toLowerCase() + o.name.slice(1)}.`,
    '',
    '## Consequences',
    ...benefits(o).map((b) => `+ ${b}`),
    ...costs(o).map((c) => `- ${c}`),
  ];
}

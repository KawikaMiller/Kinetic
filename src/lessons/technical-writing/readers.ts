/** Fictional change, fictional numbers: one change described three ways. */
export type DetailId = 'money' | 'cause' | 'config' | 'flag' | 'load' | 'watch' | 'rollback' | 'when';

export interface Detail {
  id: DetailId;
  label: string;
  /** The fact as the author holds it. */
  fact: string;
  /** What a version's text contains when it keeps this detail. */
  marker: RegExp;
}

export const DETAILS: readonly Detail[] = [
  { id: 'money', label: 'Business value', fact: 'Recovers about $41k a month in payments that fail today.', marker: /\$41k/ },
  { id: 'cause', label: 'Why it fails', fact: '2.1% of first card attempts fail on transient provider errors.', marker: /2\.1%|2 in 100/ },
  { id: 'config', label: 'The settings', fact: 'Retries go from 3 to 5, with exponential backoff from a 200 ms base.', marker: /200 ms/ },
  { id: 'flag', label: 'The flag', fact: 'It ships behind the flag payments_retry_v2.', marker: /payments_retry_v2/ },
  { id: 'load', label: 'The extra load', fact: 'During a provider incident, up to 1.7x peak calls to their API.', marker: /1\.7x/ },
  { id: 'watch', label: 'What to watch', fact: 'The payments-retry-rate dashboard; it pages above 8%.', marker: /payments-retry-rate/ },
  { id: 'rollback', label: 'How to undo it', fact: 'Setting the flag to 0% takes effect in about a minute; no deploy.', marker: /a minute/ },
  { id: 'when', label: 'When', fact: 'Tuesday 14:00 UTC, to 10% of traffic.', marker: /Tuesday/ },
];

export type ReaderId = 'exec' | 'peer' | 'sre';

export interface Reader {
  id: ReaderId;
  label: string;
  /** What this reader is doing when they read it. */
  situation: string;
  /** The details this reader needs to act. */
  needs: readonly DetailId[];
}

export const READERS: readonly Reader[] = [
  { id: 'exec', label: 'Executive', situation: 'Skims between meetings and decides whether it matters.', needs: ['money', 'cause', 'rollback', 'when'] },
  { id: 'peer', label: 'Peer engineer', situation: 'Reviews the design and has to defend or extend it.', needs: ['cause', 'config', 'flag', 'load', 'rollback'] },
  { id: 'sre', label: 'On-call SRE', situation: 'Will be paged if it misbehaves and must act fast.', needs: ['config', 'flag', 'load', 'watch', 'rollback', 'when'] },
];

export interface Version {
  /** The label the learner sees; the order is deliberately not exec, peer, SRE. */
  id: 'A' | 'B' | 'C';
  /** The reader it was written for: hidden until the learner matches. */
  reader: ReaderId;
  text: string;
}

export const VERSIONS: readonly Version[] = [
  {
    id: 'A',
    reader: 'sre',
    text: 'Tuesday 14:00 UTC: payments_retry_v2 goes to 10% of traffic (retries 3 to 5, exponential backoff from 200 ms). While the provider is failing, expect up to 1.7x peak calls to their API. Watch payments-retry-rate; it pages above 8%. To roll back, set the flag to 0%; it takes effect in about a minute.',
  },
  {
    id: 'B',
    reader: 'exec',
    text: 'Checkout will retry failed card payments more patiently. About 2 in 100 first attempts fail on short provider hiccups, and we expect to recover roughly $41k a month. It starts Tuesday for a small share of customers and can be switched off within about a minute.',
  },
  {
    id: 'C',
    reader: 'peer',
    text: 'Card-payment retries go from 3 to 5, with exponential backoff from a 200 ms base, behind the flag payments_retry_v2. About 2.1% of first attempts fail on transient provider errors. Worst case, during a provider incident, we send up to 1.7x our peak calls to their API. Rolling back is a flag flip that takes about a minute to propagate, no deploy.',
  },
];

export const readerOf = (id: ReaderId): Reader => {
  const r = READERS.find((x) => x.id === id);
  if (!r) throw new Error(`unknown reader ${id}`);
  return r;
};

/** The details a version's text actually contains, found by reading the text. */
export const keptBy = (v: Version): DetailId[] => DETAILS.filter((d) => d.marker.test(v.text)).map((d) => d.id);

export interface Fit {
  fits: boolean;
  /** Details the reader needs that this version leaves out. */
  missing: DetailId[];
  /** Details this version spends words on that the reader does not need. */
  extra: DetailId[];
}

/** How well a version serves a reader: it fits when it keeps everything they need and nothing more. */
export function fitOf(v: Version, reader: ReaderId): Fit {
  const kept = new Set(keptBy(v));
  const needs = new Set(readerOf(reader).needs);
  const missing = [...needs].filter((d) => !kept.has(d));
  const extra = [...kept].filter((d) => !needs.has(d));
  return { fits: missing.length === 0 && extra.length === 0, missing, extra };
}

export const detailLabel = (id: DetailId): string => DETAILS.find((d) => d.id === id)!.label.toLowerCase();

/** One sentence on why a match does or does not work. */
export function explainFit(fit: Fit, reader: ReaderId): string {
  const who = readerOf(reader).label.toLowerCase();
  if (fit.fits) return `Fits: it keeps what the ${who} needs and spends no words on what they do not.`;
  const a = /^[aeiou]/.test(who) ? 'an' : 'a';
  const parts: string[] = [];
  if (fit.missing.length > 0) parts.push(`${a} ${who} needs ${fit.missing.map(detailLabel).join(', ')}, which this version leaves out`);
  if (fit.extra.length > 0) parts.push(`it spends words on ${fit.extra.map(detailLabel).join(', ')}, which ${a} ${who} can do without`);
  return `Not a fit: ${parts.join('; and ')}.`;
}

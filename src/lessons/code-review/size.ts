/**
 * The shape of the PR-size trade-off, not real measurements. Published review studies
 * (e.g. SmartBear's analysis of reviews at Cisco) found that past a few hundred lines,
 * reviewers find fewer defects per line and take much longer; these curves only mimic that
 * shape, in relative units, so no invented figures appear on screen.
 */

export const MIN_LINES = 20;
export const MAX_LINES = 1500;
/** Where attention starts to drop off in the illustrative curve. */
export const ATTENTION_LINES = 400;

/** Relative review effort: grows with size, and faster once attention flags. */
export function relativeReviewTime(lines: number): number {
  return lines * (1 + lines / (ATTENTION_LINES * 2));
}

/** Relative defects found per line reviewed: 1 for tiny PRs, falling past ATTENTION_LINES. */
export function relativeDefectRate(lines: number): number {
  return 1 / (1 + (lines / ATTENTION_LINES) ** 2);
}

export type SizeVerdict = 'small' | 'ok' | 'large';

export function verdictFor(lines: number): SizeVerdict {
  if (lines <= ATTENTION_LINES / 2) return 'small';
  return lines <= ATTENTION_LINES ? 'ok' : 'large';
}

export const CHECKLIST = [
  'The description says why, not just what',
  'I reviewed my own diff first',
  'Tests cover the new behaviour',
  'Screenshots for any UI change',
] as const;

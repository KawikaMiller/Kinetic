// Findings and the readable per-lesson report. One finding is the FIRST offence of its kind on one control, with
// the control and the value that triggered it, so a failure is reproducible by hand.
import { KINDS } from './scan.mjs';

/** Findings listed per lesson before "... and N more". */
const SHOWN_PER_LESSON = 12;

/** A fresh result for one lesson: findings (deduped) and the tallies the report prints. */
export function createResult(id) {
  return {
    id,
    findings: [],
    scenes: 0,
    controls: 0,
    actions: 0,
    keyPresses: 0,
    captions: 0,
    budget: null,
    ms: 0,
    seen: new Set(),
    captionSet: new Set(),
  };
}

/** Kinds identified by what the page said, not by the control: the same message in one scene is one finding. */
const BY_MESSAGE = new Set(['residue', 'console', 'react-warning', 'render-loop', 'glued-caption', 'off-page-request', 'phone-layout', 'small-text']);

/**
 * Add a finding unless it is a repeat: a control already has one of this kind in this scene, or (for message kinds)
 * the scene already heard this message. Returns true when it was new.
 */
export function addFinding(result, { kind, scene, control, action, detail }) {
  const key = BY_MESSAGE.has(kind) ? `${scene}|${kind}|${detail.replace(/\d+/g, '#').slice(0, 120)}` : `${scene}|${control}|${kind}`;
  if (result.seen.has(key)) return false;
  result.seen.add(key);
  result.findings.push({ kind, scene, control, action, detail });
  return true;
}

const kindOrder = (kind) => KINDS.indexOf(kind);

function formatFinding(f) {
  const where = [f.scene && `scene "${f.scene}"`, f.control, f.action].filter(Boolean).join(' / ');
  return `    [${f.kind}] ${where}: ${f.detail}`;
}

/** The report for one lesson: a status line, then each finding (worst kinds first). */
export function formatLesson(result) {
  const clean = result.findings.length === 0;
  const tally = `scenes=${result.scenes} controls=${result.controls} actions=${result.actions} keys=${result.keyPresses} captions=${result.captions}`;
  const secs = `${(result.ms / 1000).toFixed(1)}s`;
  const head = `${clean ? 'ok  ' : 'FAIL'} ${result.id.padEnd(30)} ${tally} ${secs}`;
  const budget = result.budget ? [`    BUDGET REACHED after ${result.budget}: later controls were not exercised (raise it, or shard the lesson's scenes)`] : [];
  if (clean) return [head, ...budget].join('\n');
  const sorted = [...result.findings].sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind));
  const lines = [...budget, ...sorted.slice(0, SHOWN_PER_LESSON).map(formatFinding)];
  if (sorted.length > SHOWN_PER_LESSON) lines.push(`    ... and ${sorted.length - SHOWN_PER_LESSON} more (use --json=<file> for all)`);
  return [head, ...lines].join('\n');
}

/** Totals over every lesson, for the last line and the machine-readable summary. */
export function summarize(results) {
  const failed = results.filter((r) => r.findings.length);
  const byKind = {};
  for (const r of results) for (const f of r.findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  const sum = (key) => results.reduce((n, r) => n + r[key], 0);
  return {
    lessons: results.length,
    clean: results.length - failed.length,
    failed: failed.map((r) => r.id),
    budgetReached: results.filter((r) => r.budget).map((r) => r.id),
    findings: results.reduce((n, r) => n + r.findings.length, 0),
    byKind,
    scenes: sum('scenes'),
    controls: sum('controls'),
    actions: sum('actions'),
    keyPresses: sum('keyPresses'),
    captions: sum('captions'),
    seconds: Math.round(sum('ms') / 1000),
  };
}

/** The plain JSON of a result (sets dropped), for --json. */
export const toJson = ({ seen: _seen, captionSet: _captionSet, ...rest }) => rest;

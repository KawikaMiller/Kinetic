// Pure detectors of `npm run sweep`: text in, verdict out, no browser. Each one is unit-tested (scan.test.mjs)
// and each one is also fired by a fixture page in a real browser (fixtures.mjs), so a detector cannot silently rot.

/** Finding kinds, in the order a report lists them. */
export const KINDS = [
  'error-boundary',
  'render-loop',
  'react-warning',
  'console',
  'residue',
  'focus-dropped',
  'frozen-player',
  'off-page-request',
  'glued-caption',
  'caption-placeholder',
  'small-text',
  'phone-layout',
  'driver',
  'unresponsive',
];

// --- text residue ---------------------------------------------------------------------------------------------

const UNITS = String.raw`(?:ms|µs|us|ns|s|sec|min|h|kb|mb|gb|tb|kib|mib|gib|b|bytes?|%|x|px|rps|qps|req)`;
/**
 * Shapes a number-formatting bug leaves on screen. `undefined behaviour` (C and C++ lessons) is real prose, and
 * `null` is only residue straight before a unit ("null ms"): lessons teach null pointers.
 */
const RESIDUE = [
  ['NaN', /\bNaN\b/],
  ['Infinity', /-?\bInfinity\b/],
  ['undefined', /\bundefined\b(?!\s+behaviou?r)/],
  ['[object', /\[object \w+\]/],
  ['null before a unit', new RegExp(String.raw`\bnull ?${UNITS}\b`, 'i')],
  ['-0%', /(?:^|[^\d.\w])-0(?:\.0+)?%/],
  ['0.000000', /(?:^|[^\d])0\.000000/],
  ['float residue (digits after the point beyond nine)', /\d\.\d{10,}/],
  ['float residue (e-1x exponent)', /\de-(?:1\d|[2-9]\d)\b/],
];
/** Characters of context kept either side of a residue hit. */
const CONTEXT = 30;

/** Each distinct residue shape in `text` as `{ rule, context }`: what it is and the text around it. */
export function scanResidue(text) {
  const hits = [];
  for (const [rule, pattern] of RESIDUE) {
    const m = pattern.exec(text);
    if (!m) continue;
    const context = text.slice(Math.max(0, m.index - CONTEXT), m.index + m[0].length + CONTEXT).replace(/\s+/g, ' ').trim();
    hits.push({ rule, context });
  }
  return hits;
}

// --- console --------------------------------------------------------------------------------------------------

/** Messages that are tooling chatter, not the lesson's. */
const IGNORED_CONSOLE = /Download the React DevTools|\[vite\]|favicon/i;
/** Console message shapes by kind. The first match wins, so the specific ones come before the generic. */
const CONSOLE_KINDS = [
  ['render-loop', /maximum update depth exceeded|too many re-renders/i],
  ['react-warning', /two children with the same key|same key|unique "key"|cannot update a component|cannot update during an existing state transition|received (nan|infinity)|`nan` is an invalid value|invalid value for prop|invalid prop|unknown prop|does not recognize the|invalid dom property|unknown event handler|non-boolean attribute|received `\w+` for a non-boolean|each child in a list/i],
];

/** The finding kind of a console `error`/`warning`/`pageerror` message, or null for tooling chatter. */
export function classifyConsole(text) {
  if (IGNORED_CONSOLE.test(text)) return null;
  for (const [kind, pattern] of CONSOLE_KINDS) if (pattern.test(text)) return kind;
  return 'console';
}

// --- crashed stage --------------------------------------------------------------------------------------------

const CRASH_TEXT = /This lesson hit an error|Something went wrong/;

/** True when the page text is an error boundary's fallback. */
export const isCrashText = (text) => CRASH_TEXT.test(text);

// --- focus ----------------------------------------------------------------------------------------------------

/**
 * Whether keyboard focus was lost by an action. `before` says the acted-on control had focus going in (a click on
 * a non-focusable area is not a drop); `after` describes where focus is now.
 */
export function focusDropped(before, after) {
  return Boolean(before?.focused) && Boolean(after?.dropped);
}

// --- frozen player ------------------------------------------------------------------------------------------

/** A player that was playing, not at its last frame, and whose frame counter has not moved. */
export const frozenPlayer = ({ before, after, atEnd }) => !atEnd && before === after;

// --- requests -------------------------------------------------------------------------------------------------

/** Hosts the app loads its web fonts from (index.html): the only third parties a lesson page may talk to. */
const ALLOWED_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

/** True when `url` leaves the page: an http(s)/ws(s) request to a host other than the dev server's own. */
export function isOffPage(url, baseUrl) {
  let target;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (!/^(?:https?|wss?):$/.test(target.protocol)) return false;
  if (ALLOWED_HOSTS.has(target.hostname)) return false;
  return target.host !== new URL(baseUrl).host;
}

// --- text size ------------------------------------------------------------------------------------------------

/** Smallest text a phone should render, in CSS px (the same floor smoke --mobile enforces). */
export { MIN_SCENE_TEXT_PX as MIN_TEXT_PX } from '../phone.mjs';

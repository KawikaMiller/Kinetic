// A toy file tree and the path arithmetic a download handler does with it. Everything is a model:
// the names are fictional, nothing on your machine is read, and the "file system" is the list below.

export const ROOT = '/srv/shop';
export const UPLOADS = `${ROOT}/uploads`;

export interface Entry {
  path: string;
  kind: 'dir' | 'file';
}

export const ENTRIES: Entry[] = [
  { path: ROOT, kind: 'dir' },
  { path: UPLOADS, kind: 'dir' },
  { path: `${UPLOADS}/invoice-42.pdf`, kind: 'file' },
  { path: `${UPLOADS}/2026`, kind: 'dir' },
  { path: `${UPLOADS}/2026/march.csv`, kind: 'file' },
  { path: `${ROOT}/uploads-old`, kind: 'dir' },
  { path: `${ROOT}/uploads-old/legacy.txt`, kind: 'file' },
  { path: `${ROOT}/logo.png`, kind: 'file' },
  { path: `${ROOT}/config`, kind: 'dir' },
  { path: `${ROOT}/config/settings.yml`, kind: 'file' },
  { path: `${ROOT}/keys`, kind: 'dir' },
  { path: `${ROOT}/keys/signing.key`, kind: 'file' },
];

const byPath = new Map(ENTRIES.map((e) => [e.path, e]));
export const entryAt = (path: string) => byPath.get(path);
export const fileExists = (path: string) => byPath.get(path)?.kind === 'file';

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
export const childrenOf = (path: string): string[] => ENTRIES.filter((e) => e.path !== ROOT && parentOf(e.path) === path).map((e) => e.path);
export const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * Collapse `.`, `..` and repeated separators in an absolute path, the way `path.posix.normalize`
 * does: `..` at the top stays at the top, and a trailing separator survives.
 */
export function normalize(path: string): string {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  const body = `/${out.join('/')}`;
  return path.endsWith('/') && body !== '/' ? `${body}/` : body;
}

/** `join(base, name)`: glue the name on after the base, then normalise. An empty name adds nothing. */
export const joinPath = (base: string, name: string) => normalize(name === '' ? base : `${base}/${name}`);

/** Is `path` strictly under `root`? The trailing separator keeps `uploads-old` from passing as `uploads`. */
export function isInside(root: string, path: string): boolean {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return path.startsWith(prefix) && path.length > prefix.length;
}

export type StepKind = 'skip' | 'down' | 'up' | 'at-top';

export interface WalkStep {
  kind: StepKind;
  segment: string;
  /** The path after this step. */
  path: string;
  /** The path before it (for drawing the climb). */
  from: string;
}

/** Walk the name's segments one at a time from the base: what `joinPath` does, made visible. */
export function walk(base: string, name: string): WalkStep[] {
  const stack = base.split('/').filter(Boolean);
  const at = () => `/${stack.join('/')}`;
  const steps: WalkStep[] = [];
  for (const segment of name.split('/')) {
    const from = at();
    let kind: StepKind;
    if (segment === '' || segment === '.') kind = 'skip';
    else if (segment === '..') {
      kind = stack.length ? 'up' : 'at-top';
      stack.pop();
    } else {
      kind = 'down';
      stack.push(segment);
    }
    steps.push({ kind, segment, path: at(), from });
  }
  return steps;
}

// ── What a handler does with the name ──────────────────────────────────────

export type HandlerMode = 'join' | 'check' | 'id';

export const FILE_IDS: { id: string; path: string }[] = [
  { id: 'f-1', path: `${UPLOADS}/invoice-42.pdf` },
  { id: 'f-2', path: `${UPLOADS}/2026/march.csv` },
];

export type Status = 'served' | 'not-found' | 'rejected';

export interface Outcome {
  mode: HandlerMode;
  /** The path the handler ends up opening, or null when it never builds one. */
  path: string | null;
  /** The path is outside the uploads folder (the folder itself does not count as outside). */
  escaped: boolean;
  /** The path is the uploads folder itself: not outside it, but not a file inside it either. */
  atRoot: boolean;
  status: Status;
}

export function handle(mode: HandlerMode, name: string): Outcome {
  if (mode === 'id') {
    const row = FILE_IDS.find((f) => f.id === name);
    return { mode, path: row?.path ?? null, escaped: false, atRoot: false, status: row ? 'served' : 'not-found' };
  }
  const path = joinPath(UPLOADS, name);
  const atRoot = path.replace(/\/$/, '') === UPLOADS;
  const escaped = !atRoot && !isInside(UPLOADS, path);
  // The check wants a path strictly under the folder, so the folder itself is refused too.
  if (mode === 'check' && (escaped || atRoot)) return { mode, path, escaped, atRoot, status: 'rejected' };
  return { mode, path, escaped, atRoot, status: fileExists(path) ? 'served' : 'not-found' };
}

/** The handler opened (or tried to open) something outside uploads: the bug, whether or not a file was there. */
export const isUnsafe = (o: Outcome) => o.escaped && o.status !== 'rejected';

// ── The typed file name ───────────────────────────────────────────────────

export const MAX_NAME = 60;
const NAME_CHARS = /^[A-Za-z0-9._/-]+$/;

export type ParsedName = { ok: true; value: string } | { ok: false; error: string };

/** A file name or relative path: letters, digits and `. _ - /`, up to 60. Refused otherwise, never coerced. */
export function parseName(text: string): ParsedName {
  if (text.length === 0) return { ok: false, error: 'Type a file name or a relative path.' };
  if (text !== text.trim()) return { ok: false, error: 'Remove the spaces around the name.' };
  if (text.length > MAX_NAME) return { ok: false, error: `Keep it under ${MAX_NAME + 1} characters.` };
  if (/[\\%]/.test(text)) {
    return { ok: false, error: 'Backslashes and %-encoding are not modelled here: check after decoding, on the platform\'s own resolver.' };
  }
  if (!NAME_CHARS.test(text)) return { ok: false, error: 'This model takes letters, digits and . _ - / only.' };
  return { ok: true, value: text };
}

export const SAMPLES: { id: string; name: string; note: string }[] = [
  { id: 'invoice', name: 'invoice-42.pdf', note: 'an ordinary file' },
  { id: 'nested', name: '2026/march.csv', note: 'a file in a folder' },
  { id: 'dots', name: 'notes..txt', note: 'two dots inside a name: harmless' },
  { id: 'up', name: '../logo.png', note: 'a typed path that goes up one folder by accident' },
];

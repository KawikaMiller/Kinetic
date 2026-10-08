/**
 * Typed child-process access for tests. The app's tsconfig has no Node types (adding them would
 * change timer types app-wide), so `node:child_process` is loaded at run time and given just the
 * shape used here. Test-only: never import this from app code.
 */

export interface SpawnOptions {
  /** Milliseconds before the child is killed (default 10 s). */
  timeout?: number;
  cwd?: string;
  /** Written to the child's stdin. */
  input?: string;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  /** Exit code, or null if the child was killed (e.g. by the timeout). */
  status: number | null;
}

type RawSpawnSync = (cmd: string, args: readonly string[], o: SpawnOptions & { encoding: 'utf8' }) => SpawnResult;

const DEFAULT_TIMEOUT_MS = 10_000;
// A variable specifier keeps both TypeScript and Vite from resolving it at build time.
const CHILD_PROCESS = 'node:child_process';
const raw = ((await import(/* @vite-ignore */ CHILD_PROCESS)) as { spawnSync: RawSpawnSync }).spawnSync;

/** The Node binary running the tests. */
export const nodePath: string = (globalThis as unknown as { process: { execPath: string } }).process.execPath;

/** Run a command to completion and return its UTF-8 output and exit code. */
export function spawnSync(cmd: string, args: readonly string[], opts: SpawnOptions = {}): SpawnResult {
  const r = raw(cmd, args, { timeout: DEFAULT_TIMEOUT_MS, ...opts, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

/** Run a script in a fresh Node process (`node -e`); an array is joined with newlines. */
export function runNode(code: string | readonly string[], opts?: SpawnOptions): SpawnResult {
  return spawnSync(nodePath, ['-e', typeof code === 'string' ? code : code.join('\n')], opts);
}

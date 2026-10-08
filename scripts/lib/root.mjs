// Port safety: the dev server says which checkout it serves (a middleware in vite.config.ts
// answers ROOT_ENDPOINT), and the browser scripts refuse to run against any other one. Several
// worktrees run dev servers side by side, and a script pointed at the wrong port would happily
// smoke-test, screenshot or baseline somebody else's tree.
import path from 'node:path';

export const ROOT_ENDPOINT = '/__kinetic_root';
/** Set to 1 to skip the check (e.g. against a deliberately foreign server). */
export const SKIP_ENV = 'KINETIC_SKIP_ROOT_CHECK';

/** Whether two checkout paths are the same folder: separators, trailing slashes and (on Windows) case ignored. */
export function sameCheckout(a, b, platform = process.platform) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const norm = (dir) => {
    const resolved = p.resolve(dir).replace(/[\\/]+$/, '');
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
}

/**
 * Why the server's answer to ROOT_ENDPOINT doesn't match this checkout, or null when it does.
 * `served` is the parsed JSON body, or null when the server didn't answer with one (an older
 * checkout without the endpoint, or another app on the port).
 */
export function rootMismatch(served, ownRoot, baseUrl, platform = process.platform) {
  const fix = `Start this checkout's dev server on a free port (KINETIC_PORT=<port> npm run dev) and set KINETIC_URL to match, or set ${SKIP_ENV}=1 to skip this check.`;
  if (!served || typeof served.root !== 'string') {
    return `${baseUrl} doesn't say which checkout it serves (no ${ROOT_ENDPOINT}): it's an older checkout or another app, not ${ownRoot}. ${fix}`;
  }
  if (sameCheckout(served.root, ownRoot, platform)) return null;
  return `${baseUrl} serves ${served.root}, but this script belongs to ${ownRoot}. ${fix}`;
}

// Which paths the dev server's file watcher must not see. A worktree for parallel agents lives at
// `<root>/.claude/worktrees/<name>/`, so the main checkout's watcher would otherwise reload on every
// edit an agent makes there. The globs are anchored to the checkout's own root: a bare
// `**/.claude/worktrees/**` would also match every file of a dev server whose root IS a worktree.
const GLOB_SPECIALS = /[\\*?[\]{}()!]/g;
const BACKSLASHES = /\\/g;
const TRAILING_SLASHES = /\/+$/;
// Directories under the root that are never source: worktrees, screenshots, build output.
const IGNORED_DIRS = ['.claude/worktrees', '.smoke', 'dist'];

/** Forward slashes, glob characters in the path itself escaped, no trailing slash. */
function globBase(root: string): string {
  return root
    .replace(BACKSLASHES, '/')
    .replace(TRAILING_SLASHES, '')
    .replace(GLOB_SPECIALS, (c) => `\\${c}`);
}

/** Absolute, root-anchored watcher ignore globs for `server.watch.ignored`. */
export function watchIgnoreGlobs(root: string): string[] {
  const base = globBase(root);
  return IGNORED_DIRS.map((dir) => `${base}/${dir}/**`);
}

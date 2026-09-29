// A miniature git: content-addressed blobs/trees/commits and movable branch pointers.

export const FILES = ['README.md', 'src/app.js', 'src/util.js'] as const;
export type FileName = (typeof FILES)[number];

export interface Commit {
  id: string;
  parents: string[];
  msg: string;
  files: Record<FileName, string>;
  lane: number;
  seq: number;
}

export interface Repo {
  commits: Commit[];
  branches: Record<string, string>;
  lanes: Record<string, number>;
  head: string;
  seq: number;
  edits: number;
}

/** FNV-1a, shown as 7 hex chars like a short git hash. Same content → same hash. */
export function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 7);
}

export const blobId = (content: string) => hash(`blob ${content}`);
export function srcTreeId(files: Record<FileName, string>) {
  return hash(`tree app.js ${blobId(files['src/app.js'])} util.js ${blobId(files['src/util.js'])}`);
}
export function rootTreeId(files: Record<FileName, string>) {
  return hash(`tree README.md ${blobId(files['README.md'])} src ${srcTreeId(files)}`);
}
const commitId = (files: Record<FileName, string>, parents: string[], msg: string) =>
  hash(`commit tree ${rootTreeId(files)} parents ${parents.join(',')} msg ${msg}`);

function makeCommit(repo: Repo, files: Record<FileName, string>, parents: string[], msg: string, lane: number): Commit {
  repo.seq++;
  return { id: commitId(files, parents, msg), parents, msg, files, lane, seq: repo.seq };
}

export function initialRepo(): Repo {
  const repo: Repo = { commits: [], branches: {}, lanes: { main: 0 }, head: 'main', seq: 0, edits: 0 };
  const f1 = { 'README.md': '# shop v1', 'src/app.js': 'app v1', 'src/util.js': 'util v1' } as Record<FileName, string>;
  const c1 = makeCommit(repo, f1, [], 'initial commit', 0);
  const f2 = { ...f1, 'src/app.js': 'app v2' };
  const c2 = makeCommit(repo, f2, [c1.id], 'add cart', 0);
  repo.commits = [c1, c2];
  repo.branches = { main: c2.id };
  return repo;
}

export const byId = (repo: Repo, id: string) => repo.commits.find((c) => c.id === id)!;

export function ancestors(repo: Repo, id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...byId(repo, cur).parents);
  }
  return seen;
}

export function reachable(repo: Repo) {
  const all = new Set<string>();
  for (const tip of Object.values(repo.branches)) for (const id of ancestors(repo, tip)) all.add(id);
  return all;
}

/** Every distinct object git would store: commits, trees and blobs. */
export function objectCount(repo: Repo) {
  const ids = new Set<string>();
  for (const c of repo.commits) {
    ids.add(`c${c.id}`);
    ids.add(`t${rootTreeId(c.files)}`);
    ids.add(`t${srcTreeId(c.files)}`);
    for (const f of FILES) ids.add(`b${blobId(c.files[f])}`);
  }
  return ids.size;
}

const clone = (r: Repo): Repo => ({ ...r, commits: [...r.commits], branches: { ...r.branches }, lanes: { ...r.lanes } });

export type Result = { repo: Repo; kind: 'commit' | 'branch' | 'checkout' | 'ff' | 'merge' | 'uptodate' | 'rebase' | 'noop'; info: string };

export function commit(prev: Repo, file: FileName): Result {
  const repo = clone(prev);
  repo.edits++;
  const tip = byId(repo, repo.branches[repo.head]);
  const short = file.split('/').pop()!.replace(/\.\w+$/, '');
  const files = { ...tip.files, [file]: `${short} edit ${repo.edits} on ${repo.head}` };
  const c = makeCommit(repo, files, [tip.id], `edit ${file.split('/').pop()} #${repo.edits}`, repo.lanes[repo.head]);
  repo.commits.push(c);
  repo.branches[repo.head] = c.id;
  return { repo, kind: 'commit', info: file };
}

export function branch(prev: Repo): Result {
  const repo = clone(prev);
  const n = Object.keys(repo.branches).length;
  const name = `feature-${n}`;
  repo.lanes[name] = Math.max(...Object.values(repo.lanes)) + 1;
  repo.branches[name] = repo.branches[repo.head];
  repo.head = name;
  return { repo, kind: 'branch', info: name };
}

export function checkout(prev: Repo, name: string): Result {
  return { repo: { ...clone(prev), head: name }, kind: 'checkout', info: name };
}

export function merge(prev: Repo, other: string): Result {
  const repo = clone(prev);
  const ours = repo.branches[repo.head];
  const theirs = repo.branches[other];
  const oursAnc = ancestors(repo, ours);
  if (oursAnc.has(theirs)) return { repo, kind: 'uptodate', info: other };
  if (ancestors(repo, theirs).has(ours)) {
    repo.branches[repo.head] = theirs;
    return { repo, kind: 'ff', info: other };
  }
  // merge base: the most recent commit both branches share
  const common = [...ancestors(repo, theirs)].filter((id) => oursAnc.has(id)).map((id) => byId(repo, id));
  const base = common.sort((a, b) => b.seq - a.seq)[0];
  const o = byId(repo, ours);
  const t = byId(repo, theirs);
  const files = { ...o.files };
  const conflicts: string[] = [];
  for (const f of FILES) {
    if (t.files[f] === base.files[f]) continue;
    if (o.files[f] === base.files[f]) files[f] = t.files[f];
    else if (o.files[f] !== t.files[f]) {
      files[f] = `${f} merged by hand`;
      conflicts.push(f);
    }
  }
  const c = makeCommit(repo, files, [ours, theirs], `merge ${other} into ${repo.head}`, repo.lanes[repo.head]);
  repo.commits.push(c);
  repo.branches[repo.head] = c.id;
  return { repo, kind: 'merge', info: conflicts.join(', ') };
}

export function rebase(prev: Repo, onto: string): Result {
  const repo = clone(prev);
  const cur = repo.branches[repo.head];
  const target = repo.branches[onto];
  const targetAnc = ancestors(repo, target);
  if (targetAnc.has(cur)) {
    repo.branches[repo.head] = target;
    return { repo, kind: 'ff', info: onto };
  }
  const mine = [...ancestors(repo, cur)].filter((id) => !targetAnc.has(id)).map((id) => byId(repo, id))
    .filter((c) => c.parents.length === 1)
    .sort((a, b) => a.seq - b.seq);
  if (!mine.length) return { repo, kind: 'noop', info: onto };
  let tip = byId(repo, target);
  for (const old of mine) {
    const parent = byId(repo, old.parents[0]);
    const files = { ...tip.files };
    for (const f of FILES) if (old.files[f] !== parent.files[f]) files[f] = old.files[f];
    const c = makeCommit(repo, files, [tip.id], `${old.msg}′`, repo.lanes[repo.head]);
    repo.commits.push(c);
    tip = c;
  }
  repo.branches[repo.head] = tip.id;
  return { repo, kind: 'rebase', info: String(mine.length) };
}

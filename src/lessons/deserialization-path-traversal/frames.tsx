import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { FILE_IDS, UPLOADS, entryAt, handle, isUnsafe, walk, type HandlerMode, type Outcome, type WalkStep } from './vfs';

export interface PathFrame extends Frame {
  /** Existing tree nodes the walk has touched so far. */
  trail: string[];
  /** Climbs made so far, as [from, to] pairs of existing nodes. */
  climbs: [string, string][];
  /** The node the walk is on now (if it exists in the tree). */
  current: string | null;
  /** Set on the last frame. */
  outcome: Outcome | null;
  /** Which handler line is active. */
  line: number;
}

export const HANDLER_CODE: Record<HandlerMode, string[]> = {
  join: ['const full = join(UPLOADS, name);', 'return readFile(full);'],
  check: ['const full = join(UPLOADS, name);', "if (!full.startsWith(UPLOADS + '/')) return reject(403);", 'return readFile(full);'],
  id: ['const row = files.get(id);', 'if (!row) return reject(404);', 'return readFile(row.path);'],
};

const code = (s: string) => <code>{s}</code>;

function stepCaption(s: WalkStep): ReactNode {
  switch (s.kind) {
    case 'skip':
      return <>{s.segment === '' ? 'An empty piece' : <>A {code('.')}</>} means &quot;stay here&quot;: still {code(s.path)}.</>;
    case 'down':
      return <>{code(s.segment)} goes down a level: {code(s.path)}{entryAt(s.path) ? '' : ' (nothing exists there yet)'}.</>;
    case 'up':
      return <>{code('..')} climbs <span className="hl violet">one level up</span>: from {code(s.from)} to {code(s.path)}.</>;
    default:
      return <>{code('..')} at the very top stays at the top: {code(s.path)}.</>;
  }
}

export function finalCaption(o: Outcome): ReactNode {
  if (o.mode === 'id') {
    return o.status === 'served'
      ? <><span className="hl ok">Found.</span> The id picked a row, and the row holds the path {code(o.path ?? '')}. The input never touched the file system.</>
      : <><span className="hl ok">404.</span> That is not an id in the table, so no path is ever built from it.</>;
  }
  const where = o.atRoot ? <><span className="hl ok">the uploads folder itself</span></> : o.escaped ? <><span className="hl bad">outside</span> {code(UPLOADS)}</> : <><span className="hl ok">inside</span> {code(UPLOADS)}</>;
  const path = code(o.path ?? '');
  if (o.status === 'rejected') return <><span className="hl ok">Rejected (403).</span> The finished path {path} is {where}{o.atRoot ? ', not a file inside it' : ''}, and the check says so before anything is opened.</>;
  if (isUnsafe(o)) {
    return o.status === 'served'
      ? <><span className="hl bad">Served.</span> The handler opens {path}, which is {where}: the name chose which file to read.</>
      : <><span className="hl bad">Unsafe, and only 404 by luck.</span> The handler tried to open {path}, which is {where}. No file happened to be there.</>;
  }
  return o.status === 'served'
    ? <><span className="hl ok">Served.</span> {path} is {where}, and it exists.</>
    : <><span className="hl ok">404.</span> {path} is {where}, but {o.atRoot || entryAt(o.path ?? '')?.kind === 'dir' ? 'it is a folder, not a file' : 'no such file exists'}.</>;
}

/** The walk, step by step, ending on the handler's decision. */
export function pathFrames(mode: HandlerMode, name: string): PathFrame[] {
  const outcome = handle(mode, name);
  const empty = { climbs: [] as [string, string][], current: null as string | null, outcome: null as Outcome | null };
  if (mode === 'id') {
    const row = FILE_IDS.find((f) => f.id === name);
    return [
      { ...empty, trail: [], line: 0, say: <>The URL carries an id, here {code(name)}. The handler looks it up in its own table.</> },
      { ...empty, trail: row ? [row.path] : [], current: row?.path ?? null, line: 1, say: row ? <>The table has a row for it, so the path comes from the table, not from the request.</> : <>No row has that id.</> },
      { ...empty, trail: row ? [row.path] : [], current: row?.path ?? null, outcome, line: 2, say: finalCaption(outcome) },
    ];
  }
  const base = UPLOADS.split('/').filter(Boolean).reduce<string[]>((acc, seg) => [...acc, `${acc.at(-1) ?? ''}/${seg}`], []);
  const trail = base.filter((p) => entryAt(p));
  const frames: PathFrame[] = [
    { ...empty, trail, current: UPLOADS, line: 0, say: <>The handler glues the name {code(name)} onto {code(UPLOADS)} and normalises the result, one piece at a time.</> },
  ];
  const visited = new Set(trail);
  const climbs: [string, string][] = [];
  for (const s of walk(UPLOADS, name)) {
    if (entryAt(s.path)) visited.add(s.path);
    if (s.kind === 'up' && entryAt(s.from) && entryAt(s.path)) climbs.push([s.from, s.path]);
    frames.push({ ...empty, trail: [...visited], climbs: [...climbs], current: entryAt(s.path) ? s.path : null, line: 0, say: stepCaption(s) });
  }
  const last = frames.at(-1)!;
  frames.push({
    ...last,
    current: outcome.path && entryAt(outcome.path) ? outcome.path : null,
    outcome,
    line: mode === 'check' ? (outcome.status === 'rejected' ? 1 : 2) : 1,
    say: finalCaption(outcome),
  });
  return frames;
}

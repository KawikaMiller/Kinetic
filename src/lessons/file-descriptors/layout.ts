import { heapHeight, SLOT, stackBoxes } from '../../components/memory';
import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import type { ObjKind, World } from './model';

/** Slots always shown per table; more appear only when they're in use (the leak fills all 16). */
export const MIN_SLOTS = 10;
export const SLOT_PITCH = SLOT.h + 4;
const TOP = 42;
const PROC_X = [12, 182];
export const FILE_X = 380;
export const FILE_W = 196;
export const OBJ_X = 640;
export const OBJ_W = 210;
export const SCENE_W = OBJ_X + OBJ_W + 8;
const BOX_GAP = 8;
/** One field row per box: open files show "offset · access" and the refcount; objects their kind. */
export const BOX_FIELDS = 1;
export const TITLE_Y = 18;

/** Objects are plain categories, so categorical hues: terminal sky, file orange, pipe pink, sockets grey. */
export const OBJ_TONE: Record<ObjKind, Tone> = { tty: 'sky', file: 'orange', pipe: 'pink', listen: 'muted', conn: 'muted' };
export const OBJ_KIND_LABEL: Record<ObjKind, string> = { tty: 'terminal', file: 'file', pipe: 'pipe', listen: 'listening socket', conn: 'TCP socket' };

export interface FdLayout {
  slots: number;
  procAt: Record<number, Pt>;
  slotAt: (pid: number, fd: number) => Pt;
  fileAt: Record<number, Pt>;
  objAt: Record<number, Pt>;
  height: number;
}

export function fdLayout(w: World): FdLayout {
  const highest = Math.max(-1, ...w.procs.flatMap((p) => p.fds.map((id, fd) => (id === null ? -1 : fd))));
  const slots = Math.max(MIN_SLOTS, highest + 1);
  const procAt: Record<number, Pt> = {};
  w.procs.forEach((p, i) => (procAt[p.pid] = { x: PROC_X[i], y: TOP }));
  const boxH = heapHeight(BOX_FIELDS);
  const files = [...w.files].sort((a, b) => a.id - b.id);
  const objs = [...w.objs].sort((a, b) => a.id - b.id);
  const fileTops = stackBoxes(files.map(() => boxH), { start: TOP, gap: BOX_GAP });
  const objTops = stackBoxes(objs.map(() => boxH), { start: TOP, gap: BOX_GAP });
  const fileAt: Record<number, Pt> = {};
  files.forEach((f, i) => (fileAt[f.id] = { x: FILE_X, y: fileTops.tops[i] }));
  const objAt: Record<number, Pt> = {};
  objs.forEach((o, i) => (objAt[o.id] = { x: OBJ_X, y: objTops.tops[i] }));
  const height = Math.max(TOP + slots * SLOT_PITCH, fileTops.end, objTops.end) + 10;
  return { slots, procAt, slotAt: (pid, fd) => ({ x: procAt[pid].x, y: procAt[pid].y + fd * SLOT_PITCH }), fileAt, objAt, height };
}

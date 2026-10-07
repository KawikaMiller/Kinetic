import { memoryMapLayout, type MemCell, type MemLayout, type MemoryMapProps, type MemPointer, type MemRegion } from '../../components/memory';
import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import type { VmFrame } from './frames';
import { FRAMES, LAYOUT, PAGE_SIZE, PROCS, type Kind, type Machine, type Proc, type Pte } from './model';

/**
 * Region colours: plain categories, so categorical hues. Code is grey on purpose (read-only,
 * nothing happens to it), libc pink, heap orange, stack sky.
 */
export const KIND_TONE: Record<Kind, Tone> = { code: 'muted', libc: 'pink', heap: 'orange', stack: 'sky' };

/** Contiguous runs of one kind: the regions of a process map. */
export function kindRuns(): { kind: Kind; from: number; to: number }[] {
  const runs: { kind: Kind; from: number; to: number }[] = [];
  LAYOUT.forEach((kind, vpn) => {
    if (!kind) return;
    const last = runs[runs.length - 1];
    if (last && last.kind === kind && last.to === vpn * PAGE_SIZE) last.to += PAGE_SIZE;
    else runs.push({ kind, from: vpn * PAGE_SIZE, to: (vpn + 1) * PAGE_SIZE });
  });
  return runs;
}

/** What a page-row cell says: its frame, or where its contents are while it isn't in RAM. */
export function pageCellText(pte: Pte): string {
  if (pte.present) return `→ F${pte.frame}`;
  return pte.backing === 'swap' ? 'in swap' : pte.backing === 'file' ? 'on disk' : 'untouched';
}

export function processMapProps(m: Machine, proc: Proc, current: { vaddr: number } | null): MemoryMapProps {
  const regions: MemRegion[] = kindRuns().map((r) => ({ from: r.from, to: r.to, label: r.kind, tone: KIND_TONE[r.kind] }));
  const cells: MemCell[] = m.tables[proc].filter((p) => p.kind).map((p) => ({ addr: p.vpn * PAGE_SIZE, value: pageCellText(p), ...(p.present ? {} : { tone: 'dim' as const }) }));
  const pointers: MemPointer[] = current ? [{ addr: current.vaddr, label: 'addr', tone: 'hi' }] : [];
  return { regions, cells, pointers, unit: PAGE_SIZE, direction: 'down', highlight: current ? [current.vaddr] : [], addrDigits: 4 };
}

/** A frame's cell: "F3 A:15 stack", "F1 A+B libc", "F7 free". */
export const frameCellText = (m: Machine, f: number) => {
  const owners = m.frames[f].owners;
  if (owners.length === 0) return `F${f} free`;
  if (owners.length > 1) return `F${f} ${owners.map((o) => o.proc).join('+')} libc`;
  const o = owners[0];
  return `F${f} ${o.proc}:${o.vpn} ${LAYOUT[o.vpn]}`;
};

export function physMapProps(m: Machine, marks: { frame: number | null; tone: Tone | null; ring: boolean }): MemoryMapProps {
  const cells: MemCell[] = Array.from({ length: FRAMES }, (_, f) => {
    const shared = m.frames[f].owners.length > 1;
    const tone: Tone | undefined = marks.frame === f && marks.tone ? marks.tone : shared ? 'violet' : m.frames[f].owners.length === 0 ? 'dim' : undefined;
    return { addr: f * PAGE_SIZE, value: frameCellText(m, f), ...(tone ? { tone } : {}) };
  });
  return {
    regions: [],
    cells,
    unit: PAGE_SIZE,
    direction: 'up',
    highlight: marks.ring && marks.frame !== null ? [marks.frame * PAGE_SIZE] : [],
    addrDigits: 4,
  };
}

/** Pages whose contents are in swap right now (not in RAM). */
export const swapped = (m: Machine) => PROCS.flatMap((proc) => m.tables[proc].filter((p) => !p.present && p.backing === 'swap').map((p) => ({ proc, vpn: p.vpn })));

/** Horizontal gap between the three maps, where the page → frame arrows run. */
export const MAP_GAP = 60;
export const SWAP_GAP = 26;
/** Swap box: a title row, then one line per SWAP_PER_LINE swapped pages. */
export const SWAP_HEAD = 30;
export const SWAP_LINE = 16;
export const SWAP_PER_LINE = 4;
export const swapLines = (m: Machine) => {
  const items = swapped(m).map((p) => `${p.proc}:${p.vpn}`);
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += SWAP_PER_LINE) lines.push(items.slice(i, i + SWAP_PER_LINE).join('  '));
  return lines.length ? lines : ['empty'];
};

// ---------- the whole scene ----------

const TOP = 28;
export const TITLE_Y = 14;
/** Steps of a fault that flash the frame involved in --orange. */
const FAULT_STEPS = new Set(['free', 'victim', 'swapout', 'load', 'shared']);

export interface SceneGeometry {
  width: number;
  height: number;
  at: Record<Proc | 'phys', Pt>;
  layouts: Record<Proc | 'phys', MemLayout>;
  props: Record<Proc | 'phys', MemoryMapProps>;
  swap: { x: number; y: number; w: number; h: number; lines: string[] };
}

export function sceneGeometry(f: VmFrame): SceneGeometry {
  const { m, step, access } = f;
  const current = (proc: Proc) => (access && access.proc === proc ? { vaddr: access.vaddr } : null);
  const fault = step && FAULT_STEPS.has(step.kind);
  const marks = { frame: step?.frame ?? null, tone: (fault ? 'orange' : null) as Tone | null, ring: step?.kind === 'done' };
  const props = { A: processMapProps(m, 'A', current('A')), phys: physMapProps(m, marks), B: processMapProps(m, 'B', current('B')) };
  const layouts = { A: memoryMapLayout(props.A), phys: memoryMapLayout(props.phys), B: memoryMapLayout(props.B) };
  const at = { A: { x: 0, y: TOP }, phys: { x: layouts.A.width + MAP_GAP, y: TOP }, B: { x: 0, y: TOP } };
  at.B = { x: at.phys.x + layouts.phys.width + MAP_GAP, y: TOP };
  const lines = swapLines(m);
  const swap = { x: at.phys.x + layouts.phys.cols.cell, y: TOP + layouts.phys.height + SWAP_GAP, w: layouts.phys.cols.cellW, h: SWAP_HEAD + lines.length * SWAP_LINE, lines };
  const height = Math.max(layouts.A.height, layouts.B.height, layouts.phys.height + SWAP_GAP + swap.h) + TOP + 6;
  return { width: at.B.x + layouts.B.width, height, at, layouts, props, swap };
}

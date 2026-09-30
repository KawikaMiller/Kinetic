// Where the CPU's parts and the memory cells sit, and the data paths between them.
import type { Pt } from '../../core/geometry';

export const SCENE = { width: 780, height: 372 };

export interface Unit {
  at: Pt;
  w: number;
  h: number;
}

export const UNITS = {
  pc: { at: { x: 82, y: 58 }, w: 124, h: 56 },
  ir: { at: { x: 278, y: 58 }, w: 214, h: 56 },
  r0: { at: { x: 82, y: 196 }, w: 124, h: 52 },
  r1: { at: { x: 82, y: 300 }, w: 124, h: 52 },
  alu: { at: { x: 278, y: 238 }, w: 150, h: 76 },
  z: { at: { x: 278, y: 334 }, w: 124, h: 40 },
} satisfies Record<string, Unit>;

export type UnitId = keyof typeof UNITS;

const MEM_X = 452;
const MEM_Y = 14;
export const CELL = 78;
const CELL_GAP = 4;
const MEM_COLS = 4;

export function cellAt(addr: number): Pt {
  const col = addr % MEM_COLS;
  const row = Math.floor(addr / MEM_COLS);
  return { x: MEM_X + col * (CELL + CELL_GAP) + CELL / 2, y: MEM_Y + row * (CELL + CELL_GAP) + CELL / 2 };
}

const edge = (u: UnitId, side: 'left' | 'right' | 'top' | 'bottom', dy = 0): Pt => {
  const { at, w, h } = UNITS[u];
  if (side === 'left') return { x: at.x - w / 2, y: at.y + dy };
  if (side === 'right') return { x: at.x + w / 2, y: at.y + dy };
  return { x: at.x, y: at.y + (side === 'top' ? -h / 2 : h / 2) };
};

/**
 * Buses arrive at the memory's left edge, level with the addressed cell's row
 * (the cell itself lights up), so they never cut across other cells.
 */
const BUS_GAP = 6;
const cellEdge = (addr: number): Pt => ({ x: MEM_X - BUS_GAP, y: cellAt(addr).y });

export interface Path {
  from: Pt;
  to: Pt;
  /** Address bus (dashed) or data bus (solid). */
  kind: 'address' | 'data';
}

export const PATHS = {
  fetchAddress: (at: number): Path => ({ from: edge('pc', 'right', -14), to: cellEdge(at), kind: 'address' }),
  fetchData: (at: number): Path => ({ from: cellEdge(at), to: edge('ir', 'right'), kind: 'data' }),
  irAddress: (addr: number): Path => ({ from: edge('ir', 'right', 14), to: cellEdge(addr), kind: 'address' }),
  memToReg: (addr: number, reg: 0 | 1): Path => ({ from: cellEdge(addr), to: edge(reg === 0 ? 'r0' : 'r1', 'right'), kind: 'data' }),
  regToMem: (reg: 0 | 1, addr: number): Path => ({ from: edge(reg === 0 ? 'r0' : 'r1', 'right', -10), to: cellEdge(addr), kind: 'data' }),
  toAlu: (reg: 0 | 1): Path => ({ from: edge(reg === 0 ? 'r0' : 'r1', 'right', reg === 0 ? 8 : 0), to: edge('alu', 'left', reg === 0 ? -14 : 14), kind: 'data' }),
  aluToR0: (): Path => ({ from: edge('alu', 'left', -28), to: edge('r0', 'right', -12), kind: 'data' }),
  aluToZ: (): Path => ({ from: edge('alu', 'bottom'), to: edge('z', 'top'), kind: 'data' }),
  jump: (): Path => ({ from: edge('ir', 'left'), to: edge('pc', 'right'), kind: 'address' }),
};

/** A trapezoid ALU symbol, centred on (0, 0). */
export const ALU_PATH = 'M -75 -38 L 75 -38 L 52 38 L 12 38 L 0 22 L -12 38 L -52 38 Z';

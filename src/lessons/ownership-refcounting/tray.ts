import type { Op, Slot } from './heap';

export type OpKind = Op['kind'];

export const OP_KINDS: { value: OpKind; label: string }[] = [
  { value: 'new', label: 'x = new' },
  { value: 'copy', label: 'x = y' },
  { value: 'setNext', label: 'x.next = y' },
  { value: 'null', label: 'x = null' },
  { value: 'clearNext', label: 'x.next = null' },
  { value: 'collect', label: 'collect' },
];

export interface Tray {
  kind: OpKind;
  first: Slot;
  second: Slot;
  weak: boolean;
}

/** Which of the tray's pickers the operation reads: the others are hidden and must not change the operation. */
export const usesSecond = (kind: OpKind): boolean => kind === 'copy' || kind === 'setNext';
export const usesFirst = (kind: OpKind): boolean => kind !== 'collect';
export const usesWeak = (kind: OpKind): boolean => kind === 'setNext';

/** The operation the tray's current choices describe. */
export function buildOp(t: Tray): Op {
  switch (t.kind) {
    case 'new': return { kind: 'new', slot: t.first };
    case 'null': return { kind: 'null', slot: t.first };
    case 'copy': return { kind: 'copy', to: t.first, from: t.second };
    case 'setNext': return { kind: 'setNext', slot: t.first, target: t.second, weak: t.weak };
    case 'clearNext': return { kind: 'clearNext', slot: t.first };
    case 'collect': return { kind: 'collect' };
  }
}

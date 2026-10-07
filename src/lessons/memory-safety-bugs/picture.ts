import type { MemCell, MemPointer, MemRegion } from '../../components/memory';
import type { ByteField } from '../../core/bytes';
import type { Tone } from '../../core/tone';
import { asText, findSlot, NAME_BYTES, ROW_BYTES, type Slot, type SlotId, type StackRun } from './model';

/** The frame's bytes after the first `upTo` bytes of the copy have landed. */
export function bytesAt(run: StackRun, upTo: number): Uint8Array {
  const out = run.before.slice();
  out.set(run.after.subarray(0, upTo), 0);
  return out;
}

const slotChanged = (run: StackRun, bytes: Uint8Array, s: Slot) => bytes.subarray(s.from, s.to).some((b, i) => b !== run.before[s.from + i]);

export const SLOT_LABEL: Record<SlotId, string> = { name: 'name[8]', canary: 'canary', rbp: 'saved rbp', ret: 'return address', caller: "main's frame" };
const INTACT: Record<Exclude<SlotId, 'name'>, string> = { canary: 'intact', rbp: "→ main's frame", ret: '→ back into main', caller: "main's data" };

/** Per byte: input that stayed in the buffer is info, anything written past it is bad. */
export function byteTone(upTo: number, i: number): Tone | undefined {
  if (i >= upTo) return undefined;
  return i < NAME_BYTES ? 'info' : 'bad';
}

const slotTone = (s: Slot, changed: boolean): Tone =>
  s.id === 'name' ? 'muted' : s.id === 'caller' ? 'sky' : s.id === 'canary' && changed ? 'bad' : 'violet';

export function byteFields(run: StackRun, bytes: Uint8Array): ByteField[] {
  return run.slots.map((s) => ({ from: s.from, to: s.to - 1, tone: slotTone(s, slotChanged(run, bytes, s)), label: SLOT_LABEL[s.id] }));
}

export interface FramePicture {
  regions: MemRegion[];
  cells: MemCell[];
  pointers: MemPointer[];
  highlight: number[];
}

/** The MemoryMap view: one row per 8-byte slot, low addresses on top. */
export function framePicture(run: StackRun, upTo: number, fresh: [number, number] | null): FramePicture {
  const bytes = bytesAt(run, upTo);
  const A = run.layout.frameAddr;
  const regions: MemRegion[] = [];
  const cells: MemCell[] = [];
  for (const s of run.slots) {
    const tone = slotTone(s, slotChanged(run, bytes, s));
    const label = s.id === 'caller' ? `${SLOT_LABEL.caller} (part)` : SLOT_LABEL[s.id];
    regions.push({ from: A + s.from, to: A + s.to, label, tone, variant: s.id === 'canary' ? 'guard' : undefined });

    for (let row = s.from; row < s.to; row += ROW_BYTES) {
      if (s.id === 'name') {
        const name = bytes.subarray(0, NAME_BYTES);
        const end = name.indexOf(0);
        cells.push({ addr: A + row, value: upTo ? `"${asText(name.subarray(0, end < 0 ? NAME_BYTES : end))}"` : '(empty)', tone: upTo ? 'info' : undefined });
      } else {
        const rowChanged = bytes.subarray(row, row + ROW_BYTES).some((b, i) => b !== run.before[row + i]);
        cells.push({ addr: A + row, value: rowChanged ? 'overwritten' : INTACT[s.id], tone: rowChanged ? 'bad' : undefined });
      }
    }
  }
  return {
    regions,
    cells,
    pointers: [
      { addr: A, label: 'rsp', tone: 'muted' },
      { addr: A + findSlot(run.slots, 'rbp')!.from, label: 'rbp', tone: 'muted' },
    ],
    highlight: fresh ? [A + fresh[0]] : [],
  };
}

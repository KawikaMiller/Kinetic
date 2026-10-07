import type { MemCell, MemPointer, MemRegion } from '../../components/memory';
import type { ByteField } from '../../core/bytes';
import type { Tone } from '../../core/tone';
import { asText, NAME_BYTES, ROW_BYTES, SLOTS, slotById, type SlotId, type StackRun } from './model';

/** The frame's bytes after the first `upTo` bytes of the copy have landed. */
export function bytesAt(run: StackRun, upTo: number): Uint8Array {
  const out = run.before.slice();
  out.set(run.after.subarray(0, upTo), 0);
  return out;
}

const slotChanged = (run: StackRun, bytes: Uint8Array, id: SlotId) => {
  const s = slotById(id);
  return bytes.subarray(s.from, s.to).some((b, i) => b !== run.before[s.from + i]);
};

const SLOT_LABEL: Record<SlotId, string> = { name: 'name[8]', canary: 'canary', rbp: 'saved rbp', ret: 'return address', caller: "main's frame" };
const INTACT: Record<Exclude<SlotId, 'name'>, string> = { canary: 'intact', rbp: "→ main's frame", ret: '→ back into main', caller: "main's data" };

export const slotLabel = (id: SlotId, canary: boolean) => (id === 'canary' && !canary ? 'padding' : SLOT_LABEL[id]);

/** Per byte: input that stayed in the buffer is info, anything written past it is bad. */
export function byteTone(upTo: number, i: number): Tone | undefined {
  if (i >= upTo) return undefined;
  return i < NAME_BYTES ? 'info' : 'bad';
}

export function byteFields(run: StackRun, bytes: Uint8Array): ByteField[] {
  return SLOTS.map((s) => {
    const changed = s.id !== 'name' && slotChanged(run, bytes, s.id);
    const tone: Tone = s.id === 'name' || (s.id === 'canary' && !run.defences.canary) ? 'muted' : s.id === 'caller' ? 'sky' : changed && s.id === 'canary' ? 'bad' : 'violet';
    return { from: s.from, to: s.to - 1, tone, label: slotLabel(s.id, run.defences.canary) };
  });
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
  const canaryOn = run.defences.canary;
  const regions: MemRegion[] = [];
  const cells: MemCell[] = [];
  for (const s of SLOTS) {
    const changed = s.id !== 'name' && slotChanged(run, bytes, s.id);
    const label = slotLabel(s.id, canaryOn);
    if (s.id === 'canary' && canaryOn) regions.push({ from: A + s.from, to: A + s.to, label, tone: changed ? 'bad' : 'violet', variant: 'guard' });
    else if (s.id === 'caller') regions.push({ from: A + s.from, to: A + s.to, label: `${label} (part)`, tone: 'sky' });
    else regions.push({ from: A + s.from, to: A + s.to, label, tone: s.id === 'rbp' || s.id === 'ret' ? 'violet' : 'muted' });

    for (let row = s.from; row < s.to; row += ROW_BYTES) {
      const rowChanged = bytes.subarray(row, row + ROW_BYTES).some((b, i) => b !== run.before[row + i]);
      if (s.id === 'name') {
        const name = bytes.subarray(0, NAME_BYTES);
        const end = name.indexOf(0);
        cells.push({ addr: A + row, value: upTo ? `"${asText(name.subarray(0, end < 0 ? NAME_BYTES : end))}"` : '(empty)', tone: upTo ? 'info' : undefined });
      } else {
        const intact = s.id === 'canary' && !canaryOn ? 'leftover bytes' : INTACT[s.id];
        cells.push({ addr: A + row, value: rowChanged ? 'overwritten' : intact, tone: rowChanged ? 'bad' : undefined });
      }
    }
  }
  return {
    regions,
    cells,
    pointers: [
      { addr: A, label: 'rsp', tone: 'muted' },
      { addr: A + slotById('rbp').from, label: 'rbp', tone: 'muted' },
    ],
    highlight: fresh ? [A + fresh[0]] : [],
  };
}

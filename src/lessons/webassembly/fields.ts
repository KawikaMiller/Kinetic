import type { ByteField } from '../../core/bytes';
import type { Tone } from '../../core/tone';
import { HEADER_BYTES, sectionsOf } from './modules';

/** Hues for the sections in the order they appear: categories only, never --bad or --ok. */
const SECTION_TONES: readonly Tone[] = ['muted', 'amber', 'pink', 'sky', 'orange', 'violet', 'info'];

/** The byte grid's fields: the header, then each section with its own hue (assigned in order, named in the key). */
export function moduleFields(bytes: Uint8Array): ByteField[] {
  const header: ByteField = { from: 0, to: HEADER_BYTES - 1, tone: SECTION_TONES[0], label: 'magic number and version' };
  return [header, ...sectionsOf(bytes).map((s, i): ByteField => ({ from: s.from, to: s.to, tone: SECTION_TONES[(i + 1) % SECTION_TONES.length], label: `${s.name} section` }))];
}

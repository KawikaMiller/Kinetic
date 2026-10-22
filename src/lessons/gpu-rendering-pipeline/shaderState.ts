/** Scene 2's state as pure functions: the typed fields, the shader last applied and the reason a field was refused. */
import type { MeshId } from './mesh';
import { DEFAULT_PRESET, SHADER_PRESETS, compileChannels } from './shader';

export type Fields = readonly [string, string, string];
export interface ShaderState {
  mesh: MeshId;
  turnDeg: number;
  /** What the learner has typed (kept as typed, even when refused). */
  fields: Fields;
  /** The fields of the last shader that compiled: what the image shows. */
  applied: Fields;
  /** The refusal for each channel, null for a channel that is fine. */
  errors: readonly (string | null)[];
}

export const SHADER_TURN = { min: 0, max: 345, step: 15 } as const;
const presetFields = (id: string): Fields => (SHADER_PRESETS.find((p) => p.id === id) ?? SHADER_PRESETS[0]).fields;

export function initialShader(): ShaderState {
  const fields = presetFields(DEFAULT_PRESET);
  return { mesh: 'cube', turnDeg: 30, fields, applied: fields, errors: [null, null, null] };
}

/** The preset whose three fields are exactly what is typed, or null (derived, so no state can disagree with the text). */
export const activePreset = (s: ShaderState): string | null =>
  SHADER_PRESETS.find((p) => p.fields.every((f, i) => f === s.fields[i]))?.id ?? null;

/** Typing into one channel: it is applied when all three compile, and refused with the reason otherwise (the image stays). */
export function typeField(s: ShaderState, channel: number, text: string): ShaderState {
  const fields = s.fields.map((f, i) => (i === channel ? text : f)) as unknown as Fields;
  const compiled = compileChannels(fields);
  return compiled.ok ? { ...s, fields, applied: fields, errors: [null, null, null] } : { ...s, fields, errors: compiled.errors };
}

export function choosePreset(s: ShaderState, id: string): ShaderState {
  const fields = presetFields(id);
  return { ...s, fields, applied: fields, errors: [null, null, null] };
}

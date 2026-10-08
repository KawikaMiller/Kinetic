import type { Input, Mode } from './link';
import { GEOM2_O, GEOM_O, MAIN_O, PRINTF_O } from './objects';

export type PresetId = 'ok' | 'missing' | 'duplicate' | 'wrongOrder' | 'rightOrder';

export interface Preset {
  id: PresetId;
  label: string;
  /** What's on the command line after `gcc -no-pie -o app`, in order. */
  args: string[];
}

export const PRESETS: Preset[] = [
  { id: 'ok', label: 'main.o geom.o', args: ['main.o', 'geom.o'] },
  { id: 'missing', label: 'Forget geom.o', args: ['main.o'] },
  { id: 'duplicate', label: 'area defined twice', args: ['main.o', 'geom.o', 'geom2.o'] },
  { id: 'wrongOrder', label: 'Library first', args: ['-L.', '-lgeom', 'main.o'] },
  { id: 'rightOrder', label: 'Library last', args: ['main.o', '-L.', '-lgeom'] },
];

const OBJECTS = { 'main.o': MAIN_O, 'geom.o': GEOM_O, 'geom2.o': GEOM2_O } as const;

/** libgeom.a is `ar rcs libgeom.a geom.o`. */
export const LIBGEOM: Input = { kind: 'archive', name: 'libgeom.a', flag: '-lgeom', members: [GEOM_O] };
/** gcc adds -lc after everything you list: the shared libc by default, the archive with -static. */
export const LIBC_SHARED: Input = { kind: 'shared', name: 'libc.so.6', flag: '-lc', exports: ['printf', 'puts', 'malloc', 'free'] };
export const LIBC_STATIC: Input = { kind: 'archive', name: 'libc.a', flag: '-lc', members: [PRINTF_O] };

export function inputsFor(p: Preset, mode: Mode): Input[] {
  const inputs: Input[] = [];
  for (const a of p.args) {
    if (a === '-L.') continue;
    if (a === '-lgeom') inputs.push(LIBGEOM);
    else inputs.push({ kind: 'obj', obj: OBJECTS[a as keyof typeof OBJECTS] });
  }
  inputs.push(mode === 'static' ? LIBC_STATIC : LIBC_SHARED);
  return inputs;
}

export const commandFor = (p: Preset, mode: Mode) => `gcc -no-pie ${mode === 'static' ? '-static ' : ''}-o app ${p.args.join(' ')}`;

export const inputName = (i: Input) => (i.kind === 'obj' ? i.obj.name : i.name);

/**
 * Illustrative file sizes for a tiny program like this one on x86-64 Linux with glibc: a
 * dynamically linked build is around 16 KB, a static one around 800 KB, because printf drags
 * in formatting, locale and stdio code from libc.a.
 */
export const FILE_SIZE = { dynamic: 16_000, static: 800_000 } as const;

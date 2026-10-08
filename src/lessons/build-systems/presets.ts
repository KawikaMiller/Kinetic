import type { BuildGraph, BuildNode, FileState, Files } from './model';

/** A small C project: six sources, four objects, two static libraries, an app and a test binary. */
export const SOURCES = ['math.h', 'math.c', 'io.h', 'io.c', 'main.c', 'test.c'] as const;
export type SourceId = (typeof SOURCES)[number];

const NODES: BuildNode[] = [
  ...SOURCES.map((id): BuildNode => ({ id, kind: 'src', cmd: '' })),
  { id: 'math.o', kind: 'obj', cmd: 'cc -O2 -c math.c -o math.o' },
  { id: 'io.o', kind: 'obj', cmd: 'cc -O2 -c io.c -o io.o' },
  { id: 'main.o', kind: 'obj', cmd: 'cc -O2 -c main.c -o main.o' },
  { id: 'test.o', kind: 'obj', cmd: 'cc -O2 -c test.c -o test.o' },
  { id: 'libmath.a', kind: 'lib', cmd: 'ar rcs libmath.a math.o' },
  { id: 'libio.a', kind: 'lib', cmd: 'ar rcs libio.a io.o' },
  { id: 'app', kind: 'bin', cmd: 'cc -o app main.o libmath.a libio.a' },
  { id: 'tests', kind: 'bin', cmd: 'cc -o tests test.o libmath.a' },
];

/** What each target really reads (main.c includes both headers; test.c includes math.h). */
const ACTUAL: Record<string, string[]> = {
  'math.o': ['math.c', 'math.h'],
  'io.o': ['io.c', 'io.h'],
  'main.o': ['main.c', 'math.h', 'io.h'],
  'test.o': ['test.c', 'math.h'],
  'libmath.a': ['math.o'],
  'libio.a': ['io.o'],
  app: ['main.o', 'libmath.a', 'libio.a'],
  tests: ['test.o', 'libmath.a'],
};

export type PresetId = 'good' | 'missing' | 'env';
export interface Preset {
  id: PresetId;
  label: string;
  /** The fix chip's label, for the presets that have one. */
  fix?: string;
}
export const PRESETS: readonly Preset[] = [
  { id: 'good', label: 'Correct dependencies' },
  { id: 'missing', label: 'Missing dependency', fix: 'Declare math.h for main.o' },
  { id: 'env', label: 'Hermeticity break', fix: 'Declare LOG_LEVEL as an input' },
];

/** The build file for a preset, with or without its fix applied. */
export function graphFor(preset: PresetId, fixed: boolean): BuildGraph {
  const declared = { ...ACTUAL };
  if (preset === 'missing' && !fixed) declared['main.o'] = ['main.c', 'io.h'];
  return {
    nodes: NODES,
    declared: { ...Object.fromEntries(SOURCES.map((s) => [s, []])), ...declared },
    actual: { ...Object.fromEntries(SOURCES.map((s) => [s, []])), ...ACTUAL },
    readsEnv: preset === 'env' ? ['main.o'] : [],
    envDeclared: preset === 'env' && fixed,
  };
}

/** This machine's environment, and the teammate's whose build filled the remote cache. */
export const ENV = { mine: 'info', teammate: 'debug' } as const;

/** A file's text at code version `v` (each code edit bumps it). */
const CODE: Record<SourceId, (v: number) => string> = {
  'math.h': (v) => `#define FACTOR ${10 + v}\nint scale(int x);`,
  'math.c': (v) => `#include "math.h"\nint scale(int x) { return x * FACTOR + ${v}; }`,
  'io.h': (v) => `#define IO_WIDTH ${4 + v}\nvoid print_int(int n);`,
  'io.c': (v) => `#include "io.h"\nvoid print_int(int n) { printf("%*d\\n", IO_WIDTH, n${v ? ` + ${v}` : ''}); }`,
  'main.c': (v) => `#include "math.h"\n#include "io.h"\nint main(void) { print_int(scale(${4 + v})); }`,
  'test.c': (v) => `#include "math.h"\nint main(void) { return scale(2) == ${20 + v} ? 0 : 1; }`,
};
const COMMENT = (id: SourceId, v: number) => (v ? `${id}: comment edited ${v}×` : `${id}: first version`);

/** Per-file edit counters: the learner's edits, which the file text is derived from. */
export interface FileEdits {
  code: number;
  comment: number;
  mtime: number;
}
export type EditKind = 'code' | 'comment' | 'touch';

export const initialEdits = (): Record<SourceId, FileEdits> =>
  Object.fromEntries(SOURCES.map((s) => [s, { code: 0, comment: 0, mtime: 0 }])) as Record<SourceId, FileEdits>;

export const fileState = (id: SourceId, e: FileEdits): FileState => ({ code: CODE[id](e.code), comment: COMMENT(id, e.comment), mtime: e.mtime });
export const filesOf = (edits: Record<SourceId, FileEdits>): Files =>
  Object.fromEntries(SOURCES.map((s) => [s, fileState(s, edits[s])]));

/** Apply one edit: a code or comment change bumps that counter; every edit (touch too) bumps the mtime. */
export function edit(e: FileEdits, kind: EditKind, tick: number): FileEdits {
  return { code: e.code + (kind === 'code' ? 1 : 0), comment: e.comment + (kind === 'comment' ? 1 : 0), mtime: tick };
}

export const isSource = (id: string): id is SourceId => (SOURCES as readonly string[]).includes(id);

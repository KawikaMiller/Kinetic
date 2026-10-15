import { compileSource, formatInstr } from './lang';

/** `a + b` as CPython 3.12.10 printed it with `python -m dis` while this lesson was written (offsets and the line column left out). */
export const CPYTHON_LISTING = ['RESUME 0', 'LOAD_FAST 0 (a)', 'LOAD_FAST 1 (b)', 'BINARY_OP 0 (+)', 'RETURN_VALUE'];

/** `int add(int a, int b)` as `javap -c` shows an instance method, from memory (slot 0 holds this). */
export const JVM_LISTING = ['iload_1', 'iload_2', 'iadd', 'ireturn'];

const ours = () => {
  const c = compileSource('print a + b');
  return c.ok ? c.value.map(formatInstr) : [];
};
export const OWN_LISTING = ours();


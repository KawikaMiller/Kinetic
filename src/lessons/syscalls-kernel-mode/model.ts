/**
 * System calls on Linux x86-64, as data the stage draws: the steps of one blocking read(),
 * a privileged instruction faulting, the syscall count of a copy loop, and which library
 * functions trap. Every time is an illustrative constant; the mechanics are the real ones.
 */

/** Shown on every scene. */
export const HONESTY = 'Linux on x86-64; timings are illustrative, real costs vary by CPU and security mitigations.';

/**
 * Linux x86-64 syscall numbers (arch/x86/entry/syscalls/syscall_64.tbl). `open` (2) still exists,
 * but glibc 2.26 and later implement open() with `openat` (257, with AT_FDCWD), which is what strace shows.
 */
export const SYSCALL_NR = { read: 0, write: 1, open: 2, close: 3, getpid: 39, openat: 257 } as const;

/** Illustrative costs, ns. Real ones vary by CPU, kernel and security mitigations. */
export const COST_NS = {
  call: 2, // an ordinary function call
  setup: 1, // loading the registers
  enter: 80, // syscall: switch to ring 0, kernel entry, save registers
  dispatch: 5, // index the syscall table
  pageCache: 150, // find the file's page in the page cache
  copy: 400, // copy 4 KiB into the user buffer
  exit: 60, // restore registers, sysret
} as const;

export type Band = 'user' | 'kernel';
export type NodeId = 'app' | 'libc' | 'buf' | 'entry' | 'table' | 'vfs';

export interface Regs {
  rax: string;
  rdi: string;
  rsi: string;
  rdx: string;
}

export interface CallStep {
  id: string;
  /** Where the CPU is executing. */
  at: NodeId;
  /** The packet moving this step, if any. */
  move?: { from: NodeId; to: NodeId; label: string; fault?: boolean };
  /** 3 = user, 0 = kernel. */
  ring: 3 | 0;
  regs: Regs;
  /** Line of the libc wrapper listing that's running, if any. */
  wrapperLine: number | null;
  /** Lines of the kernel path listing running this step. */
  kernelLines: number[];
  /** Cost of this step, ns (illustrative). */
  costNs: number;
  /** Crossings of the user/kernel boundary in this step (0 or 1). */
  crossing: 0 | 1;
  /** Privilege preset: the process is dead. */
  killed?: boolean;
}

export const NODE_BAND: Record<NodeId, Band> = { app: 'user', libc: 'user', buf: 'user', entry: 'kernel', table: 'kernel', vfs: 'kernel' };

export const WRAPPER = ['read:', '  mov eax, 0     ; syscall number for read', '  syscall         ; trap into the kernel', '  ret             ; rax = bytes read'];
export const KERNEL_PATH = [
  'entry_SYSCALL_64   ; save user registers',
  'sys_call_table[0]  ; rax = 0 → sys_read (a switch in recent kernels)',
  'ksys_read → vfs_read',
  'page cache lookup  ; data already in RAM',
  'copy_to_user(buf)  ; 4096 bytes',
  'sysret             ; back to ring 3',
];

const FD = '3';
const BUF = '0x7ffd5e10';
const COUNT = '4096';
const empty: Regs = { rax: '?', rdi: '?', rsi: '?', rdx: '?' };
const args: Regs = { rax: '?', rdi: FD, rsi: BUF, rdx: COUNT };

/** One `read(3, buf, 4096)` that the page cache can serve without waiting for the disk. */
export const READ_STEPS: CallStep[] = [
  { id: 'call', at: 'libc', move: { from: 'app', to: 'libc', label: 'read(3, buf, 4096)' }, ring: 3, regs: args, wrapperLine: 0, kernelLines: [], costNs: COST_NS.call, crossing: 0 },
  { id: 'setup', at: 'libc', ring: 3, regs: { ...args, rax: String(SYSCALL_NR.read) }, wrapperLine: 1, kernelLines: [], costNs: COST_NS.setup, crossing: 0 },
  { id: 'trap', at: 'entry', move: { from: 'libc', to: 'entry', label: 'syscall' }, ring: 0, regs: { ...args, rax: String(SYSCALL_NR.read) }, wrapperLine: 2, kernelLines: [0], costNs: COST_NS.enter, crossing: 1 },
  { id: 'dispatch', at: 'table', move: { from: 'entry', to: 'table', label: 'rax = 0' }, ring: 0, regs: { ...args, rax: String(SYSCALL_NR.read) }, wrapperLine: 2, kernelLines: [1], costNs: COST_NS.dispatch, crossing: 0 },
  { id: 'vfs', at: 'vfs', move: { from: 'table', to: 'vfs', label: 'sys_read' }, ring: 0, regs: { ...args, rax: String(SYSCALL_NR.read) }, wrapperLine: 2, kernelLines: [2, 3], costNs: COST_NS.pageCache, crossing: 0 },
  { id: 'copy', at: 'vfs', move: { from: 'vfs', to: 'buf', label: '4096 bytes' }, ring: 0, regs: { ...args, rax: String(SYSCALL_NR.read) }, wrapperLine: 2, kernelLines: [4], costNs: COST_NS.copy, crossing: 0 },
  { id: 'sysret', at: 'libc', move: { from: 'vfs', to: 'libc', label: 'rax = 4096' }, ring: 3, regs: { ...args, rax: COUNT }, wrapperLine: 3, kernelLines: [5], costNs: COST_NS.exit, crossing: 1 },
  { id: 'return', at: 'app', move: { from: 'libc', to: 'app', label: '4096' }, ring: 3, regs: { ...args, rax: COUNT }, wrapperLine: null, kernelLines: [], costNs: COST_NS.call, crossing: 0 },
];

/** User code runs `hlt`, which only ring 0 may run. */
export const PRIV_STEPS: CallStep[] = [
  { id: 'hlt', at: 'app', ring: 3, regs: empty, wrapperLine: null, kernelLines: [], costNs: 0, crossing: 0 },
  { id: 'gp', at: 'entry', move: { from: 'app', to: 'entry', label: '#GP fault', fault: true }, ring: 0, regs: empty, wrapperLine: null, kernelLines: [], costNs: COST_NS.enter, crossing: 1 },
  { id: 'signal', at: 'entry', move: { from: 'entry', to: 'app', label: 'SIGSEGV', fault: true }, ring: 0, regs: empty, wrapperLine: null, kernelLines: [], costNs: COST_NS.exit, crossing: 0 },
  { id: 'killed', at: 'entry', ring: 0, regs: empty, wrapperLine: null, kernelLines: [], costNs: 0, crossing: 0, killed: true },
];

export const totalNs = (steps: readonly CallStep[], upTo = steps.length - 1) => steps.slice(0, upTo + 1).reduce((a, s) => a + s.costNs, 0);
export const crossings = (steps: readonly CallStep[], upTo = steps.length - 1) => steps.slice(0, upTo + 1).reduce((a, s) => a + s.crossing, 0);

// ---------- batching ----------

/** Cost of one syscall round trip (enter + exit), ns, illustrative. */
export const SYSCALL_NS = COST_NS.enter + COST_NS.exit;
export const MIB = 1024 * 1024;

export interface CopyCost {
  /** read() calls that return data. */
  dataReads: number;
  /** All read() calls: the data reads plus the final one that returns 0 (end of file). */
  reads: number;
  writes: number;
  syscalls: number;
  /** Time spent only on crossing into the kernel and back, ns (illustrative). */
  crossingNs: number;
}

/** `while ((n = read(in, buf, bufBytes)) > 0) write(out, buf, n);` on a file of `fileBytes`. */
export function copyCost(fileBytes: number, bufBytes: number): CopyCost {
  if (!(Number.isInteger(fileBytes) && fileBytes >= 0 && Number.isInteger(bufBytes) && bufBytes > 0)) throw new RangeError('bad sizes');
  const dataReads = Math.ceil(fileBytes / bufBytes);
  const reads = dataReads + 1;
  const writes = dataReads;
  const syscalls = reads + writes;
  return { dataReads, reads, writes, syscalls, crossingNs: syscalls * SYSCALL_NS };
}

export const BUFFER_SIZES = [1, 512, 4096, 64 * 1024] as const;
export const COPY_FILE_BYTES = MIB;

// ---------- the sorter ----------

export type Bin = 'always' | 'sometimes' | 'never';
export const BINS: { id: Bin; label: string }[] = [
  { id: 'always', label: 'Always makes a system call' },
  { id: 'sometimes', label: 'Sometimes makes one' },
  { id: 'never', label: 'Never makes one' },
];

export interface SortItem {
  fn: string;
  answer: Bin;
  /** Other bins also counted correct (clock_gettime: the vDSO answer is "never", but rare clocks do trap). */
  alsoOk?: Bin[];
  why: string;
  source: string;
}

/**
 * The answer key, glibc on Linux x86-64. Sources: glibc stdio and malloc behaviour as documented
 * in setvbuf(3) and malloc(3); the vDSO as documented in vdso(7); getpid caching removed in
 * glibc 2.25 (NEWS); syscall numbers from syscall_64.tbl.
 */
export const SORT_KEY: SortItem[] = [
  { fn: 'printf', answer: 'sometimes', why: 'stdio buffers the text; it calls write() only when the buffer is flushed (a newline on a terminal, a full buffer, or exit).', source: 'setvbuf(3)' },
  { fn: 'write', answer: 'always', why: 'It is the thin wrapper round the write system call (number 1).', source: 'syscall_64.tbl' },
  { fn: 'malloc', answer: 'sometimes', why: 'It hands out memory the process already has, and asks the kernel for more (brk or mmap) only when it runs out.', source: 'malloc(3)' },
  { fn: 'getpid', answer: 'always', why: 'glibc stopped caching the process id in 2.25, so every call is system call 39.', source: 'glibc 2.25 NEWS' },
  {
    fn: 'clock_gettime', answer: 'never', alsoOk: ['sometimes'],
    why: 'The usual clocks are read from the vDSO, kernel-maintained data mapped into the process, with no trap. Rare clocks fall back to a real system call, so "sometimes" counts too.',
    source: 'vdso(7)',
  },
  { fn: 'strlen', answer: 'never', why: 'Counting bytes up to the terminating zero is plain user-space work.', source: 'string(3)' },
  {
    fn: 'open', answer: 'always',
    why: 'Opening a file needs the kernel. Modern glibc\'s open() makes the openat system call (257), which is what strace shows; the old open (2) still exists.',
    source: 'syscall_64.tbl; glibc 2.26 NEWS',
  },
  { fn: 'fopen', answer: 'always', why: 'It builds a FILE object in user space, but always calls open() (so openat) underneath.', source: 'fopen(3)' },
];

export const isCorrect = (item: SortItem, bin: Bin) => item.answer === bin || (item.alsoOk ?? []).includes(bin);

export function score(placed: Readonly<Record<string, Bin | undefined>>): { right: number; placed: number; total: number } {
  const done = SORT_KEY.filter((i) => placed[i.fn]);
  return { right: done.filter((i) => isCorrect(i, placed[i.fn]!)).length, placed: done.length, total: SORT_KEY.length };
}

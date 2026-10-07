// Pure model behind the containers lesson: Dockerfile layer caching, the VM-vs-container
// disk arithmetic, and the isolation demo's leak, OOM kill and restart. All numbers are
// illustrative; the components only render.

// ── Image layers ──────────────────────────────────────────────────────

export type Input = 'base' | 'deps' | 'code';

/** One Dockerfile instruction and what building its layer costs (illustrative). */
export interface Instr {
  text: string;
  /** Which inputs this instruction depends on beyond the instruction text. */
  inputs: Input[];
  seconds: number;
  size: string;
  what: string;
}

/** Copies the dependency list first, so the slow `npm ci` layer survives code edits. */
export const GOOD: Instr[] = [
  { text: 'FROM node:20-slim', inputs: ['base'], seconds: 8, size: '180 MB', what: 'base image' },
  { text: 'WORKDIR /app', inputs: [], seconds: 0.1, size: '0 B', what: 'working dir' },
  { text: 'COPY package*.json ./', inputs: ['deps'], seconds: 0.2, size: '2 KB', what: 'dependency list' },
  { text: 'RUN npm ci', inputs: [], seconds: 45, size: '95 MB', what: 'node_modules' },
  { text: 'COPY . .', inputs: ['deps', 'code'], seconds: 0.5, size: '1.2 MB', what: 'your source' },
  { text: 'CMD ["node", "server.js"]', inputs: [], seconds: 0, size: '0 B', what: 'metadata only' },
];

/** Copies all the source before installing, so any code edit reinstalls every dependency. */
export const BAD: Instr[] = [GOOD[0], GOOD[1], GOOD[4], GOOD[3], GOOD[5]];

export type Change = 'first' | Exclude<Input, 'base'>;
export type LayerStatus = 'pending' | 'cached' | 'built';

/** Builds slower than this read as "slow" (red) in the stats and the summary. */
export const SLOW_BUILD_SECONDS = 20;

export interface LayerBuild {
  status: Exclude<LayerStatus, 'pending'>;
  /** This layer's own inputs changed (rather than a layer below it). */
  changed: boolean;
  /** Build time so far, including this layer. */
  seconds: number;
}

/**
 * Docker's cache rule, layer by layer: a layer is reused only if its instruction, its
 * inputs and every layer below it are unchanged. The first miss rebuilds everything above.
 */
export function cacheBuild(file: Instr[], change: Change): LayerBuild[] {
  let missed = change === 'first';
  let seconds = 0;
  return file.map((ins) => {
    const changed = change !== 'first' && ins.inputs.includes(change);
    if (changed) missed = true;
    const status = missed ? 'built' : 'cached';
    if (status === 'built') seconds += ins.seconds;
    return { status, changed, seconds };
  });
}

// ── VMs vs containers ─────────────────────────────────────────────────

export const APPS = ['web', 'api', 'worker', 'cron'];
/** Illustrative sizes: a guest OS image and one app with its libraries. */
export const VM_OS_GB = 2;
export const APP_GB = 0.2;
const MB_PER_GB = 1000;

export const vmDiskGb = (n: number) => n * (VM_OS_GB + APP_GB);
export const containerDiskMb = (n: number) => n * APP_GB * MB_PER_GB;

// ── Isolation ─────────────────────────────────────────────────────────

export interface Container {
  name: string;
  cmd: string;
  hostPid: number;
  ip: string;
  hostPort: number;
  mem: number;
  cpu: number;
  status: 'running' | 'oom' | 'restarting';
}

/** Each container's cgroup memory limit, in MB. */
export const LIMIT_MB = 256;
/** Made-up but plausible: host PIDs, docker0 bridge addresses, published ports, usage. */
export const START: Container[] = [
  { name: 'web', cmd: 'nginx', hostPid: 4012, ip: '172.17.0.2', hostPort: 8080, mem: 38, cpu: 12, status: 'running' },
  { name: 'api', cmd: 'node server.js', hostPid: 4078, ip: '172.17.0.3', hostPort: 8081, mem: 120, cpu: 35, status: 'running' },
  { name: 'worker', cmd: 'python worker.py', hostPid: 4133, ip: '172.17.0.4', hostPort: 8082, mem: 90, cpu: 20, status: 'running' },
];
export const WORKER = 2;

/** The leak: every tick, worker's memory and CPU climb by these steps. */
export const LEAK_STEP_MB = 14;
const LEAK_STEP_CPU = 4;
const CPU_CAP = 95;
/** A restarted process gets a new host PID; this is just a plausible jump. */
const PID_BUMP = 97;
/** A meter turns red above this share of its maximum: near the limit, before the kill. */
export const HOT_PCT = 85;

/** The PID a container's process has, seen from inside its PID namespace or from the host. */
export const pidSeenFrom = (c: Container, host: boolean) => (host ? c.hostPid : 1);

/** One leak tick: memory climbs; reaching the cgroup limit means the kernel OOM-kills it. */
export function leakTick(c: Container, limit = LIMIT_MB): Container {
  if (c.status !== 'running') return c;
  if (c.mem + LEAK_STEP_MB >= limit) return { ...c, mem: limit, status: 'oom' };
  return { ...c, mem: c.mem + LEAK_STEP_MB, cpu: Math.min(CPU_CAP, c.cpu + LEAK_STEP_CPU) };
}

/** The restart policy, one phase at a time: killed -> restarting -> a fresh process. */
export function restartPhase(c: Container, fresh: Container): Container {
  if (c.status === 'oom') return { ...c, status: 'restarting' };
  if (c.status === 'restarting') return { ...fresh, hostPid: c.hostPid + PID_BUMP };
  return c;
}

export const meterHot = (value: number, max: number) => Math.min(100, (value / max) * 100) > HOT_PCT;

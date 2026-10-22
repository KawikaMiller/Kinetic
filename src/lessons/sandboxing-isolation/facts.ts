/** Every number the lesson text quotes, computed once from the model at each scene's opening state. */
import { USER_MAP, memoryOutcome, pidsOutcome, cpuShare, OTHER_CPU_WEIGHT, NAMESPACE_ORDER } from './isolation';
import { initialKernel, initialRings, initialSeccomp, initialViews } from './opening';
import { ACTION_ORDER, RING_LABEL, RING_ORDER, decide, ringSet, strength, type Decision } from './rings';
import { NEEDED, SYSCALLS, TRACE, checkMinimal, grantedExtras, replay } from './seccomp';
import { FILTER_SIZE, HOST_SYSCALL_COUNT, HYPERVISOR_INTERFACE, SURFACES } from './surface';

const rings = initialRings();
const on = ringSet(...rings.rings);
const by = (d: Decision) => (d.kind === 'allowed' ? '' : RING_LABEL[d.by]);

const seccomp = initialSeccomp();
const opening = replay(new Set(seccomp.allowed), seccomp.otherwise);
const everything = new Set(SYSCALLS.map((s) => s.name));

const views = initialViews();
const memory = memoryOutcome(views.memoryLimitMiB, views.allocateMiB);
const pids = pidsOutcome(views.pidsLimit, views.forks);

const blockedBy = (ring: (typeof RING_ORDER)[number]) => ACTION_ORDER.filter((a) => strength(decide(a, ringSet(ring))) === 2).length;

export const num = (v: number) => v.toLocaleString('en-US');

export const FACTS = {
  ringsOn: rings.rings.map((r) => RING_LABEL[r]).join(', '),
  ringCount: RING_ORDER.length,
  fileVerdict: `${decide('file', on).kind} by ${by(decide('file', on))}`,
  kernelBugVerdict: decide('kernel-bug', on).kind,
  kernelBugWithMicrovm: `${decide('kernel-bug', ringSet(...rings.rings, 'microvm')).kind} by ${by(decide('kernel-bug', ringSet(...rings.rings, 'microvm')))}`,
  bestSingleBlocked: Math.max(...RING_ORDER.map(blockedBy)),
  seccompBlocks: blockedBy('seccomp'),
  blockedOutright: ACTION_ORDER.filter((a) => strength(decide(a, on)) === 2).length,
  actionCount: ACTION_ORDER.length,
  listSize: seccomp.allowed.length,
  catalogue: SYSCALLS.length,
  traceLength: TRACE.length,
  deniedCall: opening.firstDenied! + 1,
  deniedName: TRACE[opening.firstDenied!],
  needed: NEEDED.length,
  everythingExtras: grantedExtras(everything).length,
  everythingRuns: checkMinimal(everything).runs,
  namespaceCount: views.namespaces.length,
  namespaceKinds: NAMESPACE_ORDER.length,
  userMap: `${USER_MAP.inside} ${USER_MAP.outside} ${USER_MAP.range}`,
  userOutside: num(USER_MAP.outside),
  memoryLimit: views.memoryLimitMiB,
  allocate: views.allocateMiB,
  killedAtByte: num(memory.killedAtByte!),
  pidsLimit: views.pidsLimit,
  forks: views.forks,
  started: pids.started,
  firstFailure: pids.firstFailure!,
  cpuPercent: Math.round(cpuShare(views.cpuWeight, OTHER_CPU_WEIGHT) * 100),
  host: HOST_SYSCALL_COUNT,
  filter: FILTER_SIZE,
  hypervisor: HYPERVISOR_INTERFACE,
  kernelMode: initialKernel().mode,
  kernelUnder: SURFACES[initialKernel().mode].exposed,
};

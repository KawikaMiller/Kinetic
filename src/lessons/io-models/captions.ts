/** Captions, every number from the model on screen. Plain strings, so tests can read them. */
import { bytes } from '../../core/format';
import type { EdgeInput, EdgeRun } from './edge';
import type { Rings, Target } from './files';
import { ENTRY_NOTE, MODEL_LABEL, ROUNDS, overheadShare, type Counters, type Model } from './serve';
import type { Echo } from './trace';

export const n = (v: number) => v.toLocaleString('en-US');
export const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;
export const virtual = (b: number) => bytes(b, { dp: 1 });

export function modelsCaption(c: Counters, connections: number, activePct: number, perRequest: number): string {
  const threads = c.threads === 1 ? '1 thread' : `${n(c.threads)} threads`;
  const wasted = c.wasted > 0 ? ` ${plural(c.wasted, 'call')} returned nothing (EAGAIN).` : '';
  return `${MODEL_LABEL[c.model]}, ${plural(connections, 'connection')} with ${activePct}% ready per round: ${plural(c.served.length, 'request')} served over ${ROUNDS} rounds with ${plural(c.syscalls, 'system call')}; fd entries handled ${n(c.entries)} (${ENTRY_NOTE[c.model]}).${wasted} ${threads} reserving ${virtual(c.stackBytes)} of virtual stack; ${Math.round(overheadShare(c, perRequest) * 100)}% of the CPU ticks are overhead rather than the work.`;
}

export function traceCaption(model: Model, echo: Echo, step: number): string {
  const c = echo.calls[step];
  return `${MODEL_LABEL[model]}: ${plural(echo.calls.length, 'call')} for the 6 events. Call ${step + 1} of ${echo.calls.length} is ${c.name} at tick ${c.t}.`;
}

export const edgeIntro = (input: EdgeInput) =>
  `One connection receives 300 bytes and the handler reads ${input.readBytes} ${input.readBytes === 1 ? 'byte' : 'bytes'} per read, ${input.trigger}-triggered${input.drain ? ', reading until EAGAIN' : ', one read per notification'}. Step through it.`;

export function edgeSummary(run: EdgeRun): string {
  return run.verdict === 'hung'
    ? `Hung: ${run.remaining} of 300 bytes sit unread after ${plural(run.reports, 'notification')} and ${plural(run.reads, 'read')}, and epoll will not mention them again.`
    : `Done: all 300 bytes were read with ${plural(run.reports, 'notification')} and ${plural(run.reads, 'read')}.`;
}

export function filesCaption(target: Target, r: Rings): string {
  const kind = target === 'socket'
    ? 'A socket registers with epoll and is reported when a read would not block.'
    : 'A regular file is refused by epoll_ctl with EPERM; select and poll call it always readable even if the read must wait for the disk.';
  return `${kind} Completion queues: ${plural(r.queued, 'request')} queued, ${n(r.inflight)} in flight, ${n(r.cq)} completed and waiting, ${n(r.reaped)} collected, with ${plural(r.enters, 'call')} into the kernel.`;
}

import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { ERRNO_TEXT, FD_LIMIT, resolve, type Played, type World } from './model';

export interface FdFrame extends Frame {
  world: World;
  /** The operation this frame shows, or null for the starting state. */
  played: Played | null;
}

const objName = (w: World, pid: number, fd: number) => resolve(w, pid, fd)?.obj.name ?? '?';
const refsOf = (w: World, fileId: number) => w.files.find((f) => f.id === fileId)?.refs ?? 0;
const pidName = (w: World, pid: number) => {
  const p = w.procs.find((x) => x.pid === pid);
  return p ? `${p.name} (pid ${pid})` : `pid ${pid}`;
};

export function opCaption({ op, result, before }: Played): ReactNode {
  const w = result.world;
  const who = w.procs.length > 1 ? <>{pidName(before, op.pid)}: </> : null;
  if (!result.ok) {
    const call = op.kind === 'listen' ? 'socket()' : `${op.kind}()`;
    return (
      <>
        {who}
        {call} fails: <span className="hl bad">{result.errno}</span> ({ERRNO_TEXT[result.errno]}).
        {result.errno === 'EMFILE' ? <> All {FD_LIMIT} slots of the table are taken, so nothing new can be opened or accepted.</> : null}
      </>
    );
  }
  switch (op.kind) {
    case 'open':
      return (
        <>
          {who}
          <code>open("{op.path}")</code> returns <b>{result.fd}</b>, the lowest free slot. The kernel makes an open-file entry (offset 0) for it
          {op.cloexec ? <>, marked close-on-exec</> : null}.
        </>
      );
    case 'close': {
      const id = before.procs.find((p) => p.pid === op.pid)!.fds[op.fd]!;
      const left = refsOf(w, id);
      return (
        <>
          {who}
          <code>close({op.fd})</code> frees slot {op.fd}. {left > 0 ? <>The open-file entry still has {plural(left, 'reference')}, so it stays.</> : <>That was the last reference, so the kernel frees the entry.</>}
        </>
      );
    }
    case 'dup':
      return (
        <>
          {who}
          <code>dup({op.fd})</code> returns <b>{result.fd}</b>, the lowest free slot, pointing at the same open-file entry (now {plural(refsOf(w, resolve(w, op.pid, result.fd!)!.file.id), 'reference')}).
        </>
      );
    case 'dup2': {
      if (op.old === op.new) return <>{who}<code>dup2({op.old}, {op.new})</code> does nothing: they're already the same slot.</>;
      const was = resolve(before, op.pid, op.new);
      const same = was && was.file.id === resolve(before, op.pid, op.old)!.file.id;
      return (
        <>
          {who}
          <code>dup2({op.old}, {op.new})</code>: {same ? <>slot {op.new} already pointed at that entry, so nothing really changes</> : was ? <>slot {op.new} was on {was.obj.name}, so that reference is dropped first; now {op.new} points at {objName(w, op.pid, op.new)}</> : <>slot {op.new} now points at {objName(w, op.pid, op.new)}</>}.
        </>
      );
    }
    case 'pipe':
      return (
        <>
          {who}
          <code>pipe()</code> returns two FDs: <b>{result.fds![0]}</b> to read and <b>{result.fds![1]}</b> to write, both on one pipe in the kernel.
        </>
      );
    case 'listen':
      return <>{who}socket, bind and listen on port {op.port}: the listening socket is fd <b>{result.fd}</b>.</>;
    case 'accept':
      return <>{who}<code>accept({op.lfd})</code> returns fd <b>{result.fd}</b> for a new connection from {objName(w, op.pid, result.fd!)}.</>;
    case 'finish': {
      const used = w.procs.find((p) => p.pid === op.pid)!.fds.filter((x) => x !== null).length;
      return op.closes ? (
        <>{who}That request is done and the server closes fd {op.fd}: the slot is free again for the next connection.</>
      ) : (
        <>
          {who}This request hit an error path that forgot <code>close({op.fd})</code>. It's finished, but fd {op.fd} stays taken: <span className="hl bad">leaked</span>. {used} of {FD_LIMIT} slots used.
        </>
      );
    }
    case 'fork':
      return (
        <>
          <code>fork()</code>: the child (pid {result.pid}) gets a copy of the FD table, pointing at the <b>same</b> open-file entries, so every count goes up. They share each entry's offset.
        </>
      );
    case 'exec': {
      const p0 = before.procs.find((p) => p.pid === op.pid)!;
      const shut = p0.fds.map((id, fd) => (id !== null && p0.cloexec[fd] ? fd : -1)).filter((fd) => fd >= 0);
      return (
        <>
          {who}
          <code>exec({op.program})</code>: a new program in the same process. Its FDs stay open
          {shut.length ? <>, except {shut.map((fd) => `fd ${fd}`).join(', ')}, marked close-on-exec, which {shut.length === 1 ? 'is' : 'are'} closed</> : null}.
        </>
      );
    }
    case 'write': {
      const r = resolve(w, op.pid, op.fd)!;
      if (r.obj.kind !== 'file') return <>{who}<code>write({op.fd})</code> sends "{op.text.trim()}" to {r.obj.name}.</>;
      const at = r.file.offset - op.text.length;
      return (
        <>
          {who}
          <code>write({op.fd}, "{op.text.trim()}")</code> lands in {r.obj.name} at offset {at}; the entry's offset moves to {r.file.offset}
          {r.file.refs > 1 ? <> for everyone sharing it</> : null}.
        </>
      );
    }
  }
}

/** Where each process's FDs point now: the summary at the end of a preset. */
function summary(w: World): ReactNode {
  return (
    <>
      Now:{' '}
      {w.procs.map((p, k) => (
        <span key={p.pid}>
          {k > 0 && '; '}
          {w.procs.length > 1 ? `pid ${p.pid}` : 'the process'} has{' '}
          {p.fds
            .map((id, fd) => (id === null ? null : `${fd} → ${objName(w, p.pid, fd)}${p.leaked[fd] ? ' (leaked)' : ''}`))
            .filter(Boolean)
            .join(', ')}
        </span>
      ))}
      .
    </>
  );
}

export function fdFrames(start: World, played: readonly Played[], intro: ReactNode, withSummary: boolean): FdFrame[] {
  const rec = createRecorder<FdFrame>({ world: start, played: null });
  rec.snap(intro);
  played.forEach((p) => rec.snap(opCaption(p), p.result.ok ? undefined : 1.6, { world: p.result.world, played: p }));
  if (withSummary && played.length > 0) rec.close(summary(played[played.length - 1].result.world), 2);
  return rec.frames;
}

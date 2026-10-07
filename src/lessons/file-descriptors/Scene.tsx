import { fanBend, HeapObject, heapRect, RefArrow, slotPort, VarSlot } from '../../components/memory';
import type { FdFrame } from './frames';
import { BOX_FIELDS, FILE_W, FILE_X, fdLayout, OBJ_KIND_LABEL, OBJ_TONE, OBJ_W, OBJ_X, SCENE_W, TITLE_Y } from './layout';

/**
 * The three layers, left to right: each process's FD table (VarSlots), the kernel's
 * open-file table (HeapObjects with offset, access and refcount) and the objects behind them.
 */
export function Scene({ f }: { f: FdFrame }) {
  const w = f.world;
  const L = fdLayout(w);
  const op = f.played?.op;
  const res = f.played?.result;
  const fresh = new Set<number>(res?.ok ? [...(res.fd !== undefined ? [res.fd] : []), ...(res.fds ?? [])] : []);
  const freshPid = op && op.kind !== 'fork' ? op.pid : null;

  // How many arrows end at each open file, so they fan out instead of piling up.
  const into = new Map<number, number>();
  const nth = new Map<string, number>();
  for (const p of w.procs) {
    p.fds.forEach((id, fd) => {
      if (id === null) return;
      nth.set(`${p.pid}:${fd}`, into.get(id) ?? 0);
      into.set(id, (into.get(id) ?? 0) + 1);
    });
  }

  return (
    <svg className="fd-scene" viewBox={`0 0 ${SCENE_W} ${L.height}`} role="img" aria-label="File descriptor tables, the kernel's open-file table, and the objects they refer to">
      {w.procs.map((p) => (
        <text key={p.pid} className="fd-title" x={L.procAt[p.pid].x} y={TITLE_Y}>
          {p.name} · pid {p.pid}
        </text>
      ))}
      <text className="fd-title" x={FILE_X} y={TITLE_Y}>
        open-file table (kernel)
      </text>
      <text className="fd-title" x={OBJ_X} y={TITLE_Y}>
        files, pipes, sockets
      </text>
      {w.procs.flatMap((p) =>
        Array.from({ length: L.slots }, (_, fd) => {
          const id = p.fds[fd];
          const isNew = fresh.has(fd) && freshPid === p.pid;
          const tone = id === null ? 'dim' : p.leaked[fd] ? 'bad' : isNew ? 'hi' : 'info';
          return <VarSlot key={`${p.pid}-${fd}`} at={L.slotAt(p.pid, fd)} name={`fd ${fd}`} isRef={id !== null} value={id === null ? 'free' : undefined} tone={tone} highlight={isNew || p.leaked[fd]} />;
        }),
      )}
      {w.files.map((file) => (
        <HeapObject
          key={`f-${file.id}`}
          at={L.fileAt[file.id]}
          w={FILE_W}
          tone="violet"
          title={`entry #${file.id}`}
          fields={[{ name: `offset ${file.offset} · ${file.access}`, value: `refs ${file.refs}` }]}
        />
      ))}
      {w.objs.map((o) => (
        <HeapObject
          key={`o-${o.id}`}
          at={L.objAt[o.id]}
          w={OBJ_W}
          tone={OBJ_TONE[o.kind]}
          title={o.name}
          fields={[{ name: OBJ_KIND_LABEL[o.kind], value: o.kind === 'file' ? `${o.content.length} bytes` : '' }]}
        />
      ))}
      {w.procs.flatMap((p) =>
        p.fds.map((id, fd) =>
          id === null ? null : (
            <RefArrow
              key={`a-${p.pid}-${fd}`}
              from={slotPort(L.slotAt(p.pid, fd))}
              to={heapRect(L.fileAt[id], FILE_W, BOX_FIELDS)}
              tone={p.leaked[fd] ? 'bad' : 'violet'}
              thin={!p.leaked[fd]}
              bend={fanBend(nth.get(`${p.pid}:${fd}`)!, into.get(id)!, 10)}
            />
          ),
        ),
      )}
      {w.files.map((file) => (
        <RefArrow key={`fo-${file.id}`} from={heapRect(L.fileAt[file.id], FILE_W, BOX_FIELDS)} to={heapRect(L.objAt[file.obj], OBJ_W, BOX_FIELDS)} tone="violet" thin />
      ))}
    </svg>
  );
}

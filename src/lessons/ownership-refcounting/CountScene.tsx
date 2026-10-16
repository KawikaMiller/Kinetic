import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { MODE_LABEL, countCaption, fateText } from './captions';
import { apply, ATOMIC_COST, CHAIN_SCRIPT, CYCLE_SCRIPT, describeOp, leaked, PLAIN_COST, replay, SLOTS, updateCost, WEAK_BACK_SCRIPT, type Mode, type Op, type Slot } from './heap';
import { HEAP_WIDTH, HeapDiagram } from './HeapDiagram';
import { OPENING } from './opening';
import { buildOp, OP_KINDS, usesFirst, usesSecond, usesWeak, type Tray } from './tray';

const SCRIPTS: { id: string; label: string; log: readonly Op[] }[] = [
  { id: 'chain', label: 'A chain frees in order', log: CHAIN_SCRIPT },
  { id: 'cycle', label: 'A cycle', log: CYCLE_SCRIPT },
  { id: 'weak', label: 'Cycle with a weak back edge', log: WEAK_BACK_SCRIPT },
];
const slotOptions = SLOTS.map((s) => ({ value: s, label: s }));

/** Scene 1: count references, free at zero, and watch a cycle defeat the count. */
export function CountScene({ picker }: { picker: ReactNode }) {
  const [log, setLog] = useState<readonly Op[]>(OPENING.counting.log);
  const [view, setView] = useState<Mode>(OPENING.counting.view);
  const [atomic, setAtomic] = useState(OPENING.counting.atomic);
  const [tray, setTray] = useState<Tray>(OPENING.counting.tray);
  const [note, setNote] = useState<string | null>(null);

  const counting = useMemo(() => replay(log, 'counting'), [log]);
  const tracing = useMemo(() => replay(log, 'tracing'), [log]);
  const shown = view === 'counting' ? counting : tracing;
  const heap = shown.heaps[shown.heaps.length - 1];
  const countHeap = counting.heaps[counting.heaps.length - 1];
  const strays = leaked(countHeap);

  const act = () => {
    const op = buildOp(tray);
    const result = apply(countHeap, op, 'counting');
    if (result.refused) setNote(result.refused);
    else {
      setNote(null);
      setLog([...log, op]);
    }
  };
  const load = (next: readonly Op[]) => {
    setLog(next);
    setNote(null);
  };
  const set = (patch: Partial<Tray>) => setTray({ ...tray, ...patch });

  return (
    <StageFrame
      height={340}
      intro={countCaption({ log, counting, tracing, atomic, note })}
      introKey={`${log.map(describeOp).join('|')}-${atomic}-${note}`}
      stats={
        <Stats>
          <Stat label="Counting: freed" value={counting.fates.filter((f) => f.kind === 'freed').length} color="var(--ok)" sub="at the instant a count hit zero" />
          <Stat label="Counting: leaked" value={strays.length} color={strays.length ? 'var(--bad)' : 'var(--ok)'} sub="unreachable and never freed" />
          <Stat label="Tracing: freed" value={tracing.fates.filter((f) => f.kind === 'freed').length} color="var(--ok)" sub="only at a collect" />
          <Stat label="Count updates" value={countHeap.updates} color="var(--info)" sub={`cost ${updateCost(countHeap.updates, atomic)}: ${PLAIN_COST} plain, ${ATOMIC_COST} atomic each`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'reference count', shape: 'dot' },
            { color: 'var(--ok)', label: 'freed', shape: 'square' },
            { color: 'var(--bad)', label: 'leaked: unreachable, never freed', shape: 'square' },
            { color: 'var(--violet)', label: 'a weak reference', shape: 'line' },
            { color: 'var(--info)', label: 'unreachable, waiting for a collect (tracing view)', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Draw" value={view} onChange={setView} options={(['counting', 'tracing'] as Mode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
          <Toggle label="Counts" value={atomic} onChange={setAtomic} off="plain" on="thread-safe (atomic)" />
        </>,
        <>
          <Segmented label="Operation" value={tray.kind} onChange={(kind) => set({ kind })} options={OP_KINDS} />
        </>,
        <>
          {usesFirst(tray.kind) && <Segmented label="x" value={tray.first} onChange={(first: Slot) => set({ first })} options={slotOptions} />}
          {usesSecond(tray.kind) && <Segmented label="y" value={tray.second} onChange={(second: Slot) => set({ second })} options={slotOptions} />}
          {usesWeak(tray.kind) && <Toggle label="The reference" value={tray.weak} onChange={(weak) => set({ weak })} off="strong" on="weak" />}
          <Button variant="primary" onClick={act}>Do it</Button>
          <Button softDisabled={log.length === 0} onClick={() => log.length && load(log.slice(0, -1))}>Undo</Button>
          <Button softDisabled={log.length === 0} onClick={() => load([])}>Clear</Button>
        </>,
        <>
          {SCRIPTS.map((s) => (
            <ChipButton key={s.id} tone="info" on={log.length === s.log.length && log.every((op, i) => describeOp(op) === describeOp(s.log[i]))} onClick={() => load(s.log)}>{s.label}</ChipButton>
          ))}
          <Hint><span role="status">{note ?? `${log.length} operations so far; the same list is replayed both ways.`}</span></Hint>
        </>,
      ]}
    >
      <div className="rc-stage stage-pad">
        <WideRegion minWidth={HEAP_WIDTH} label="Heap diagram: scroll sideways to see all of it">
          <HeapDiagram heap={heap} mode={view} fates={shown.fates} />
        </WideRegion>
        <ol className="rc-log" aria-label="Operations so far">
          {log.map((op, i) => <li key={i}>{i + 1}. {describeOp(op)}</li>)}
          {log.length === 0 && <li className="rc-empty">nothing yet</li>}
        </ol>
        <table className="data-table rc-table">
          <caption>Each object under the same log</caption>
          <thead>
            <tr><th>Object</th><th>Reference counting</th><th>Tracing collection</th></tr>
          </thead>
          <tbody>
            {counting.fates.map((f, i) =>
              f.kind === 'unused' ? null : (
                <tr key={i}>
                  <td>obj {i}</td>
                  <td style={{ color: f.kind === 'freed' ? 'var(--ok)' : f.kind === 'leaked' ? 'var(--bad)' : undefined }}>{fateText(f)}</td>
                  <td style={{ color: tracing.fates[i].kind === 'freed' ? 'var(--ok)' : undefined }}>{fateText(tracing.fates[i])}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">three slots and six objects; the counts are the model's own</Provenance>
        <Provenance kind="illustrative">a plain update costs {PLAIN_COST} and an atomic one {ATOMIC_COST}: real cost depends on contention and hardware (verify on your platform). C++ shared_ptr and Rust Arc count atomically, Rc does not (from memory)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

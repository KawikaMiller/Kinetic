import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { commandCaption } from './frames';
import { EDITOR_CODE, SLOTS, canEdit, commandFor, describe, editorStep, initialEditor, occupied, type Command, type EditorAction } from './model';

const SLOT_LIST = Array.from({ length: SLOTS }, (_, i) => i);

export function CommandScene({ picker }: { picker: ReactNode }) {
  const [ed, setEd] = useState(initialEditor);
  const [last, setLast] = useState<{ a: EditorAction; ran: Command | null; cleared: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const drawRef = useRef<HTMLSpanElement>(null);
  const interacted = useRef(false);
  const target = ed.doc.find((s) => s.id === selected) ?? null;

  const run = (a: EditorAction) => {
    interacted.current = true;
    const ran = a.type === 'draw' || a.type === 'move' || a.type === 'delete' ? commandFor(ed, a) : null;
    const next = editorStep(ed, a);
    setEd(next);
    setLast({ a, ran, cleared: ran ? ed.redo.length : 0 });
    if (a.type === 'draw' && ran) setSelected(ran.id);
    if (a.type === 'delete') setSelected(next.doc[0]?.id ?? null);
  };
  // If the button that was just pressed became disabled, focus would fall to <body>: keep it on Draw.
  useEffect(() => {
    const focused = document.activeElement;
    const lost = focused === document.body || (focused instanceof HTMLButtonElement && focused.disabled);
    if (interacted.current && lost) drawRef.current?.querySelector('button')?.focus();
  }, [ed]);
  useIntroCaption(commandCaption(ed, last?.a ?? null, last?.ran ?? null, last?.cleared ?? 0), [ed, last]);

  const move: EditorAction | null = target ? { type: 'move', id: target.id } : null;
  const del: EditorAction | null = target ? { type: 'delete', id: target.id } : null;

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Undo stack" value={ed.undo.length} color="var(--violet)" />
          <Stat label="Redo stack" value={ed.redo.length} color="var(--sky)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'selected shape' },
            { color: 'var(--violet)', label: 'undo stack (top = next undo)' },
            { color: 'var(--sky)', label: 'redo stack (top = next redo)' },
            { color: 'var(--dim)', label: 'unavailable action' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <span ref={drawRef}>
            <Button variant="primary" onClick={() => run({ type: 'draw' })} disabled={!canEdit(ed, { type: 'draw' })}>
              Draw
            </Button>
          </span>
          <Button onClick={() => move && run(move)} disabled={!move || !canEdit(ed, move)}>
            Move →
          </Button>
          <Button onClick={() => del && run(del)} disabled={!del}>
            Delete
          </Button>
          <Button onClick={() => run({ type: 'undo' })} disabled={!canEdit(ed, { type: 'undo' })}>
            ↶ Undo
          </Button>
          <Button onClick={() => run({ type: 'redo' })} disabled={!canEdit(ed, { type: 'redo' })}>
            ↷ Redo
          </Button>
        </>,
      ]}
    >
      <div className="bp stage-pad">
        <div className="bp-canvas" role="group" aria-label="Drawing canvas: six slots; choose a shape to move or delete it">
          {SLOT_LIST.map((x) => {
            const s = ed.doc.find((d) => d.x === x);
            return s ? (
              <button key={x} type="button" className={`bp-slot is-shape ${s.id === selected ? 'is-selected' : ''}`} aria-pressed={s.id === selected} onClick={() => setSelected(s.id)}>
                {s.id}
              </button>
            ) : (
              <span key={x} className={`bp-slot ${occupied(ed.doc, x) ? '' : 'is-empty'}`} aria-label="empty slot" />
            );
          })}
        </div>
        <div className="bp-row">
          <Tray stack label="Undo stack" className="bp-undo" empty="empty">
            {[...ed.undo].reverse().map((c, i) => (
              <span key={ed.undo.length - i} className={`bp-cmd tone-violet ${i === 0 ? 'is-top' : ''}`}>
                {describe(c)}
              </span>
            ))}
          </Tray>
          <Tray stack label="Redo stack" className="bp-redo" empty="empty">
            {[...ed.redo].reverse().map((c, i) => (
              <span key={`${c.kind}-${c.id}-${ed.redo.length - i}`} className={`bp-cmd tone-sky ${i === 0 ? 'is-top' : ''}`}>
                {describe(c)}
              </span>
            ))}
          </Tray>
          <Tray stack label="Command log (every command run, undone or not)" className="bp-log" empty="nothing run yet">
            {ed.log.map((c, i) => (
              <span key={i} className="bp-cmd tone-muted">
                {i + 1}. {describe(c)}
              </span>
            ))}
          </Tray>
        </div>
        <CodePanel title="the editor" lines={EDITOR_CODE} className="bp-code" />
        <Hint block>
          A scripted editor: six slots, each new shape gets the next letter (undoing a draw does not give its letter back). Each action becomes a command object that knows how to undo itself, and the log could be sent to a server, though replaying it would also need the undo and redo events. Tested against a snapshot-history
          reference over 500 seeded sequences. When not to: if undo is only ever &quot;restore the last saved copy&quot;, saving snapshots is simpler than writing a reverse for every command.
        </Hint>
      </div>
    </StageFrame>
  );
}

import { Button, ChipButton, ControlGroup, Hint } from '../../components/ui';
import { MAX_NODES, PRESETS } from './model';
import type { SccEditor } from './useSccEditor';

export function PresetChips({ ed }: { ed: SccEditor }) {
  return (
    <ControlGroup label="Graph">
      {PRESETS.map((p) => (
        <ChipButton key={p.id} on={p.id === ed.presetId} onClick={() => ed.load(p.id)}>
          {p.label}
        </ChipButton>
      ))}
    </ControlGroup>
  );
}

/** The edit row: add a node, undo the last added edge, and how to add an edge. */
export function EditRow({ ed }: { ed: SccEditor }) {
  return (
    <>
      <Button onClick={ed.addNode} softDisabled={ed.graph.names.length >= MAX_NODES}>
        Add node
      </Button>
      <Button onClick={ed.undo} softDisabled={ed.added === 0}>
        Undo last edge
      </Button>
      <Hint>Drag from one node to another to add an edge (up to {MAX_NODES} nodes); with the keyboard press C on a node, then Enter on another. A second copy of an edge is refused, and a self-loop is not offered here (it would not change any component).</Hint>
    </>
  );
}

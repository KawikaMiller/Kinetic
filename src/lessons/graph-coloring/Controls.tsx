import { Button, ChipButton, ControlGroup, Hint } from '../../components/ui';
import { MAX_NODES, PRESETS } from './model';
import type { ColorEditor } from './useColorEditor';

export function PresetChips({ ed }: { ed: ColorEditor }) {
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

export function EditRow({ ed }: { ed: ColorEditor }) {
  return (
    <>
      <Button onClick={ed.addNode} softDisabled={ed.graph.names.length >= MAX_NODES}>
        Add node
      </Button>
      <Button onClick={ed.undo} softDisabled={ed.added === 0}>
        Undo last edge
      </Button>
      <Hint>Drag from one node to another to add an edge (up to {MAX_NODES} nodes); with the keyboard press C on a node, then Enter on another.</Hint>
    </>
  );
}

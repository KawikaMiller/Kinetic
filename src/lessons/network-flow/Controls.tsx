import { Button, ChipButton, ControlGroup, Hint } from '../../components/ui';
import { CAP_MAX, MAX_NODES, PRESETS } from './model';
import type { FlowEditor } from './useFlowEditor';

const STEPS = [-5, -1, 1, 5] as const;

export function PresetChips({ ed }: { ed: FlowEditor }) {
  return (
    <ControlGroup label="Network">
      {PRESETS.map((p) => (
        <ChipButton key={p.id} on={p.id === ed.presetId} onClick={() => ed.load(p.id)}>
          {p.label}
        </ChipButton>
      ))}
    </ControlGroup>
  );
}

/** Edit the selected pipe's capacity, remove it, or add a node; says how to add a pipe. */
export function EditRow({ ed }: { ed: FlowEditor }) {
  const e = ed.selected === null ? undefined : ed.net.edges[ed.selected];
  return (
    <>
      {STEPS.map((s) => (
        <Button key={s} onClick={() => ed.nudge(s)} disabled={!e}>
          capacity {s > 0 ? `+${s}` : `−${-s}`}
        </Button>
      ))}
      <Button onClick={ed.remove} disabled={!e}>
        Remove edge
      </Button>
      <Button onClick={ed.addNode} disabled={ed.net.names.length >= MAX_NODES}>
        Add node
      </Button>
      <Hint>
        {e
          ? `${ed.net.names[e.from]}→${ed.net.names[e.to]}, capacity ${e.cap} (edits stay in 1 to ${CAP_MAX}; any edit restarts the flow)`
          : `Click an edge to select it; drag from a node to another to add a pipe (up to ${MAX_NODES} nodes).`}
      </Hint>
    </>
  );
}

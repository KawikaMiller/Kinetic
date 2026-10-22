import { Button, Hint, TextField } from '../../components/ui';
import { MAX_NODES } from './model';
import type { TreeState } from './useTree';

/** Add a leaf under a typed parent, or go back to T0. `note` shows when nothing was refused. */
export function TreeControls({ tree, note }: { tree: TreeState; note?: string }) {
  const n = tree.parents.length;
  return (
    <>
      <TextField label={`New leaf's parent (0 to ${n - 1})`} value={tree.draft} onChange={tree.setDraft} onEnter={tree.add} width={90} spellCheck={false} />
      <Button onClick={tree.add}>Add leaf</Button>
      <Button onClick={tree.reset}>Reset tree</Button>
      <Hint tone={tree.error ? 'bad' : 'faint'}>
        <span role="status">{tree.error ?? note ?? `${n} of ${MAX_NODES} nodes. The root, node 0, is its own parent in the table.`}</span>
      </Hint>
    </>
  );
}

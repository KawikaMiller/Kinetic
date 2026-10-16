import { Button, Hint } from '../../components/ui';
import { EMPTY_EDITS, editsSummary, isEdited, type Edits } from './problem';

/** What "The matrix" edits do to the scenes that read them, with the way back to the generated matrix. */
export function EditsStrip({ edits, setEdits }: { edits: Edits; setEdits: (e: Edits) => void }) {
  const edited = isEdited(edits);
  return (
    <div className="rec-edits">
      <Hint tone="muted">{edited ? <b>{editsSummary(edits)}</b> : editsSummary(edits)}</Hint>
      <Button softDisabled={!edited} onClick={() => setEdits(EMPTY_EDITS)}>Reset my edits</Button>
    </div>
  );
}

import { Button, Hint, TextField } from '../../components/ui';
import { KEY_MAX, KEY_MIN, TREE_NODE_LIMIT } from '../../core/keyInput';

/** The key field with Insert and Delete: what the two stepper scenes share. */
export function KeyOps({
  keyText, onKeyText, onInsert, onDelete, note,
}: {
  keyText: string;
  onKeyText: (text: string) => void;
  onInsert: () => void;
  onDelete: () => void;
  note: string | null;
}) {
  return (
    <>
      <TextField label="Key" value={keyText} onChange={onKeyText} onEnter={onInsert} width={96} spellCheck={false} />
      <Button variant="primary" onClick={onInsert}>
        Insert
      </Button>
      <Button onClick={onDelete}>Delete</Button>
      <Hint>
        <span role="status">{note ?? `Whole numbers from ${KEY_MIN} to ${KEY_MAX}, each once, up to ${TREE_NODE_LIMIT} nodes. Enter inserts.`}</span>
      </Hint>
    </>
  );
}

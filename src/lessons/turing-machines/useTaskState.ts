import { useMemo, useState } from 'react';
import { parseTmTable, type Tm } from '../../core/tm';
import { ALPHABET, mustParse, parseTapeInput, TASKS, type TaskId } from './model';

/** What survives a switch of scene: the learner's table, tape and whether they have tried Check yet. */
export interface TaskState {
  task: TaskId;
  text: string;
  /** The last table that parsed: the machine that Run and Check use. */
  machine: Tm;
  /** The refusal for the text as typed now, or null when it parses. */
  tableError: string | null;
  setText: (text: string) => void;
  raw: string;
  /** The last tape that was valid. */
  input: string;
  inputError: string | null;
  setRaw: (raw: string) => void;
  attempted: boolean;
  markAttempted: () => void;
}

export function useTaskState(task: TaskId): TaskState {
  const spec = TASKS[task];
  const [text, setTextState] = useState(spec.starter);
  const [machine, setMachine] = useState<Tm>(() => mustParse(spec.starter));
  const [raw, setRawState] = useState(spec.defaultInput);
  const [input, setInput] = useState(spec.defaultInput);
  const [attempted, setAttempted] = useState(false);

  const parsed = useMemo(() => parseTmTable(text), [text]);
  const inputParse = useMemo(() => parseTapeInput(raw, ALPHABET[task]), [raw, task]);

  const setText = (next: string) => {
    setTextState(next);
    const p = parseTmTable(next);
    if (p.ok) setMachine(p.value);
  };
  const setRaw = (next: string) => {
    setRawState(next);
    const p = parseTapeInput(next, ALPHABET[task]);
    if (p.ok) setInput(p.value);
  };

  return {
    task, text, machine, tableError: parsed.ok ? null : parsed.error, setText,
    raw, input, inputError: inputParse.ok ? null : inputParse.error, setRaw,
    attempted, markAttempted: () => setAttempted(true),
  };
}

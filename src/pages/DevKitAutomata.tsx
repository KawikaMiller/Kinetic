import { useMemo, useState } from 'react';
import { TapeStrip } from '../components/TapeStrip';
import { Button, Controls, Segmented, TextArea } from '../components/ui';
import { pdaRun, type Pda, type PdaRule } from '../core/automata';
import { parseTmTable, runTm, symbolAt, tapeText, tmStart, tmStep, type TmConfig } from '../core/tm';

/** Dev-only demos of K3-17: a Turing machine on a TapeStrip with an editable table, and a PDA's configuration sets (#/dev/kit). */

const STEP_BUDGET = 500;
const PDA_BUDGET = 5000;

const INCREMENT_TABLE = 'q0 0 -> 0 R q0\nq0 1 -> 1 R q0\nq0 _ -> _ L q1\nq1 1 -> 0 L q1\nq1 0 -> 1 S halt\nq1 _ -> 1 S halt';
const LOOPING_TABLE = 'q0 _ -> _ R q1\nq1 _ -> _ L q0';
const TM_INPUTS = ['1011', '111', '0'] as const;
const TABLES = { increment: INCREMENT_TABLE, loops: LOOPING_TABLE } as const;
type TableName = keyof typeof TABLES;
const TABLE_OPTIONS = [
  { value: 'increment' as const, label: 'binary increment' },
  { value: 'loops' as const, label: 'a loop (bounces)' },
];

export function TuringDemo() {
  const [which, setWhich] = useState<TableName>('increment');
  const [text, setText] = useState(INCREMENT_TABLE);
  const [input, setInput] = useState<(typeof TM_INPUTS)[number]>('1011');
  const [stepCount, setStepCount] = useState(0);
  const parsed = useMemo(() => parseTmTable(text), [text]);

  const history = useMemo(() => {
    if (!parsed.ok) return [];
    const frames: TmConfig[] = [tmStart(parsed.value, input)];
    for (let i = 0; i < STEP_BUDGET; i++) {
      const s = tmStep(parsed.value, frames[frames.length - 1]);
      if (s.status !== 'moved') break;
      frames.push(s.config);
    }
    return frames;
  }, [parsed, input]);
  const at = Math.min(stepCount, history.length - 1);
  const config = history[at];
  const run = parsed.ok ? runTm(parsed.value, input, { maxSteps: STEP_BUDGET }) : null;
  const changed = config && at > 0 ? [history[at - 1].head] : [];

  return (
    <>
      <Controls>
        <Segmented options={TABLE_OPTIONS} value={which} onChange={(v) => { setWhich(v); setText(TABLES[v]); setStepCount(0); }} ariaLabel="Machine" />
        <Segmented options={TM_INPUTS.map((v) => ({ value: v, label: v }))} value={input} onChange={(v) => { setInput(v); setStepCount(0); }} ariaLabel="Input" />
        <Button onClick={() => setStepCount(Math.max(0, at - 1))} disabled={at === 0}>Back</Button>
        <Button variant="primary" onClick={() => setStepCount(at + 1)} disabled={!config || at >= history.length - 1}>Step</Button>
        <Button onClick={() => setStepCount(0)}>Reset</Button>
      </Controls>
      <TextArea label="Transition table (one rule per line)" value={text} onChange={(v) => { setText(v); setStepCount(0); }} rows={6} />
      {!parsed.ok && <p role="alert">{parsed.error}</p>}
      {config && (
        <>
          <TapeStrip symbol={(i) => symbolAt(config, i)} head={config.head} state={config.state} changed={changed} cells={13} fontSize={13} ariaLabel="Demo tape" />
          <p>
            Step {at} of {history.length - 1} shown, state {config.state}, tape "{tapeText(config)}".
            {run && ` Full run: ${run.status} after ${run.steps} steps${run.status === 'budget-exhausted' ? ` (the budget; this says nothing about whether it ever halts)` : ''}.`}
          </p>
        </>
      )}
    </>
  );
}

const PDA_RULES: PdaRule[] = [
  ...(['a', 'b'] as const).flatMap((s) => (['Z', 'a', 'b'] as const).map((top) => ({ from: 'q0', read: s, pop: top, to: 'q0', push: s + top }))),
  ...(['Z', 'a', 'b'] as const).map((top) => ({ from: 'q0', read: '', pop: top, to: 'q1', push: top })),
  { from: 'q1', read: 'a', pop: 'a', to: 'q1', push: '' },
  { from: 'q1', read: 'b', pop: 'b', to: 'q1', push: '' },
  { from: 'q1', read: '', pop: 'Z', to: 'qf', push: 'Z' },
];
const PALINDROME_PDA: Pda = { kind: 'pda', start: 'q0', bottom: 'Z', accept: ['qf'], rules: PDA_RULES };
const PDA_INPUTS = ['abba', 'abab', 'aabbaa'] as const;
const PDA_INPUT_OPTIONS = PDA_INPUTS.map((v) => ({ value: v, label: v }));

export function PdaDemo() {
  const [input, setInput] = useState<(typeof PDA_INPUTS)[number]>('abba');
  const [level, setLevel] = useState(0);
  const run = useMemo(() => pdaRun(PALINDROME_PDA, input, { maxConfigs: PDA_BUDGET }), [input]);
  const at = Math.min(level, run.levels.length - 1);
  return (
    <>
      <Controls>
        <Segmented options={PDA_INPUT_OPTIONS} value={input} onChange={(v) => { setInput(v); setLevel(0); }} ariaLabel="Input" />
        <Button onClick={() => setLevel(Math.max(0, at - 1))} disabled={at === 0}>Back</Button>
        <Button variant="primary" onClick={() => setLevel(at + 1)} disabled={at >= run.levels.length - 1}>Step</Button>
      </Controls>
      <p>
        w wᴿ on "{input}": move {at} of {run.levels.length - 1}, {run.levels[at].length} live configuration{run.levels[at].length === 1 ? '' : 's'}. Overall: {run.status} ({run.explored} configurations generated, budget {PDA_BUDGET}).
      </p>
      <ul>
        {run.levels[at].map((c) => (
          <li key={`${c.state}-${c.pos}-${c.stack}`}>
            ({c.state}, unread "{input.slice(c.pos)}", stack {c.stack} with the top first)
          </li>
        ))}
      </ul>
    </>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Provenance, ProvenanceRow, Stat, Stats, TextArea } from '../../components/ui';
import { buildCaption } from './captions';
import { CHECK_LENGTH, MAX_RULES, checkTable, parseTable, type CheckResult } from './learner';
import { ANBN_TABLE, BUG_TABLE, OPENING, SOLUTION_TABLE } from './opening';

const EDITOR_ROWS = 8;
const PRESETS = [
  { id: 'anbn', label: 'a^n b^n (pushes one)', text: ANBN_TABLE },
  { id: 'bug', label: 'bug: forgets to pop', text: BUG_TABLE },
];

/** Scene 3: write the table for a^n b^(2n) and let the checker find where it goes wrong. */
export function BuildScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState(OPENING.build.text);
  const [checked, setChecked] = useState<{ text: string; result: CheckResult } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const parsed = useMemo(() => parseTable(text), [text]);
  // A verdict describes the table it was run on: it disappears when the table is edited.
  const result = checked && checked.text === text ? checked.result : null;
  const edit = (next: string) => {
    setText(next);
    setRevealed(false);
  };

  return (
    <StageFrame
      height={420}
      intro={buildCaption(result)}
      introKey={result ? `${result.checked}|${result.first?.input ?? 'pass'}` : 'start'}
      stats={
        <Stats>
          <Stat label="Rules" value={parsed.ok ? `${parsed.pda.rules.length} of ${MAX_RULES}` : 'not valid'} color={parsed.ok ? 'var(--info)' : 'var(--bad)'} sub="state, input, top -> state, push" />
          <Stat
            label="Check"
            value={result === null ? 'not run' : result.first === null ? 'passes' : 'fails'}
            color={result === null ? 'var(--muted)' : result.first === null ? 'var(--ok)' : 'var(--bad)'}
            sub={result === null ? `every string up to length ${CHECK_LENGTH}` : `${result.checked.toLocaleString('en-US')} strings checked`}
          />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Start from">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={text === p.text} onClick={() => edit(p.text)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button variant="primary" onClick={() => parsed.ok && setChecked({ text, result: checkTable(parsed.pda) })} softDisabled={!parsed.ok}>
            Check
          </Button>
          <Button onClick={() => { setRevealed(true); setText(SOLUTION_TABLE); }}>Show a solution</Button>
        </>,
        <>
          <TextArea label="Transition table (one rule per line, - for none, stack starts as Z)" value={text} onChange={edit} rows={EDITOR_ROWS} />
          <Hint tone="muted" block>
            <span role="status" className="pd-status">
              {!parsed.ok ? <span className="pd-error">{parsed.error}</span> : null}
              {parsed.ok ? parsed.warnings.join(' ') : null}
              {revealed ? ' This is one solution of many.' : ''}
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="pd-stage stage-pad">
        <p className="pd-note">
          The machine starts in <code>q0</code> with <code>Z</code> on the stack, and accepts when the whole input is read and the stack is empty. A rule <code>q0 a Z -&gt; q0 AAZ</code> reads a, pops Z and pushes A, A, Z (top first). The target language is a^n b^(2n): n a's followed by twice as many b's.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">your table runs on the lesson's own PDA; the checker compares it with a counting predicate on every string up to length {CHECK_LENGTH}</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

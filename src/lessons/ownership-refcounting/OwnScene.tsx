import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { ownCaption } from './captions';
import { OPENING } from './opening';
import { checkSequential, formatLine, freedAt, liveKinds, MAX_LINES, movedFrom, PALETTE, PRESETS, RULES, type Line } from './ownership';

const RAW_LINE_LABEL = (i: number, l: Line) => `Line ${i + 1}: ${formatLine(l)}. Press to remove it.`;

/** Scene 2: build a straight-line program from the palette and see what the toy borrow checker says. */
export function OwnScene({ picker }: { picker: ReactNode }) {
  const [program, setProgram] = useState<Line[]>(OPENING.ownership.program);
  const [preset, setPreset] = useState<string | null>(OPENING.ownership.preset);
  const verdict = useMemo(() => checkSequential(program), [program]);
  const kinds = useMemo(() => liveKinds(program), [program]);
  const moved = useMemo(() => movedFrom(program), [program]);
  const bad = new Set(verdict.problems.map((p) => p.line));
  const freed = freedAt(program);
  const full = program.length >= MAX_LINES;

  const add = (l: Line) => {
    if (full) return;
    setProgram([...program, l]);
    setPreset(null);
  };
  const remove = (i: number) => {
    setProgram(program.filter((_, k) => k !== i));
    setPreset(null);
  };

  return (
    <StageFrame
      height={460}
      intro={ownCaption(program, verdict)}
      introKey={program.map(formatLine).join('|')}
      stats={
        <Stats>
          <Stat label="Verdict" value={program.length === 0 ? 'empty' : verdict.accepted ? 'accepted' : 'rejected'} color={program.length === 0 ? undefined : verdict.accepted ? 'var(--ok)' : 'var(--bad)'} sub={verdict.accepted ? 'every rule holds' : `${verdict.problems.length} problem${verdict.problems.length === 1 ? '' : 's'} found`} />
          <Stat label="Memory goes back" value={program.length === 0 ? 'nothing yet' : freed.line === null ? 'at scope end' : `line ${freed.line + 1}`} color="var(--ok)" sub="no count, no collector" />
          <Stat label="Lines" value={`${program.length} of ${MAX_LINES}`} sub="click a line to remove it" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a shared borrow is live', shape: 'square' },
            { color: 'var(--violet)', label: 'a mutable borrow is live', shape: 'square' },
            { color: 'var(--bad)', label: 'the conflicting line', shape: 'square' },
            { color: 'var(--dim)', label: 'x after it was moved', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={preset === p.id} onClick={() => { setProgram(p.program); setPreset(p.id); }}>{p.label}</ChipButton>
          ))}
          <ChipButton tone="bad" onClick={() => { setProgram([]); setPreset(null); }}>Clear</ChipButton>
        </>,
        <>
          <span className="rc-label">Add a line</span>
          {PALETTE.map((l, i) => (
            <ChipButton key={i} tone="violet" disabled={full} onClick={() => add(l)}>{formatLine(l)}</ChipButton>
          ))}
          <Hint><span role="status">{full ? `The program is full at ${MAX_LINES} lines.` : 'Pick lines in order; each press adds one at the end.'}</span></Hint>
        </>,
      ]}
    >
      <div className="rc-stage stage-pad">
        <CodePanel
          className="rc-code"
          title="A toy program (shown, not run)"
          lines={program.length ? program.map(formatLine) : ['(empty)']}
          roving
          onLineClick={(i) => program.length && remove(i)}
          lineLabel={(i) => (program.length ? RAW_LINE_LABEL(i, program[i]) : 'The program is empty')}
          stateOf={(i) => (bad.has(i) ? 'bad' : 'idle')}
          renderLine={(text, i) => (
            <span className={moved[i] ? 'rc-moved' : kinds[i] === 'mutable' ? 'rc-mut' : kinds[i] === 'shared' ? 'rc-shared' : undefined}>{text}</span>
          )}
        />
        {verdict.problems.length > 0 && (
          <ul className="rc-problems" aria-label="What the checker found">
            {verdict.problems.map((p, k) => (
              <li key={k}>
                line {p.line + 1}: {RULES[p.rule].name}
                {RULES[p.rule].code && <> <Provenance kind="from-memory">modelled on Rust {RULES[p.rule].code}</Provenance></>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a toy language with a few rules; the real Rust borrow checker has more, and accepts and rejects different programs at its edges</Provenance>
        <Provenance kind="from-memory">the error codes and the Rust names; verify the codes with rustc --explain</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

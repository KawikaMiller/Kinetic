import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { ChipButton, ControlGroup, Hint, TextField, Toggle } from '../../components/ui';
import { compileSource, formatInstr, LANG_LIMITS } from './lang';
import { DISPATCH_LINES, FETCH_LINES, linesForOp } from './dispatch';
import { SOURCE_PRESETS } from './presets';
import { RunScene } from './RunScene';
import type { VmState } from './vm';

/** Scene 1 (and 3 with `dispatch`): source to bytecode to run, with the dispatch loop shown beside the stepping. */
export function SourceScene({ picker, dispatch }: { picker: ReactNode; dispatch: boolean }) {
  const [text, setText] = useState(SOURCE_PRESETS[0].text);
  const phone = useMediaQuery(PHONE_QUERY);
  const [showLoop, setShowLoop] = useState(() => !phone);
  const compiled = useMemo(() => compileSource(text), [text]);
  const program = compiled.ok ? compiled.value : null;

  const loop = (s: VmState) => {
    const running = program && s.status === 'running' ? program[s.pc] : null;
    const active = running ? [...FETCH_LINES, ...linesForOp(running.op)] : [];
    return (
      <Box>
        <SectionTitle hint={running ? `about to run ${formatInstr(running)}` : 'the loop that runs each instruction'}>The dispatch loop</SectionTitle>
        {showLoop ? <CodePanel lines={DISPATCH_LINES} active={active} gutter="none" /> : <Hint tone="muted" block>The loop is hidden: switch it on to read it.</Hint>}
      </Box>
    );
  };

  return (
    <RunScene
      picker={picker}
      program={program}
      height={dispatch ? 760 : 640}
      controls={[
        <ControlGroup key="p" label="Source" inline>
          {SOURCE_PRESETS.map((p) => (
            <ChipButton key={p.label} tone="violet" on={text === p.text} onClick={() => setText(p.text)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
        <>
          <TextField label="Program" value={text} onChange={setText} width={phone ? '100%' : 420} spellCheck={false} ariaLabel="Source program" />
          {dispatch && <Toggle label="Dispatch loop" value={showLoop} onChange={setShowLoop} off="Hidden" on="Shown" />}
        </>,
      ]}
      above={
        <>
          {!compiled.ok && <Hint tone="muted"><span role="alert">{compiled.error} Nothing to run until it compiles.</span></Hint>}
          {compiled.ok && <Hint tone="muted">Compiled by this page’s own compiler to {compiled.value.length} instructions. Source is at most {LANG_LIMITS.maxChars} characters; the variables are a, b, c and d. A comparison pushes 1 or 0, where JavaScript would say true or false.</Hint>}
        </>
      }
      below={dispatch ? loop : undefined}
    />
  );
}

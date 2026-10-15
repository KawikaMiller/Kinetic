import { useMemo, useState, type ReactNode } from 'react';
import { ChipButton, ControlGroup, Hint, TextArea } from '../../components/ui';
import { LISTING_PRESETS } from './presets';
import { RunScene } from './RunScene';
import { assemble, ASSEMBLE_LIMITS } from './vm';

const LISTING_ROWS = 8;

/** Scene 2: write the bytecode yourself; a bad program stops with a named error, and you fix the listing and run again. */
export function AssembleScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState(LISTING_PRESETS[0].text);
  const assembled = useMemo(() => assemble(text), [text]);
  return (
    <RunScene
      picker={picker}
      program={assembled.ok ? assembled.program : null}
      height={640}
      controls={[
        <ControlGroup key="p" label="Try" inline>
          {LISTING_PRESETS.map((p) => (
            <ChipButton key={p.label} tone={p.label.startsWith('fixed') ? 'ok' : 'orange'} on={text === p.text} onClick={() => setText(p.text)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
        <TextArea key="t" label="Listing: one instruction per line" value={text} onChange={setText} rows={LISTING_ROWS} className="bv-listing-field" />,
      ]}
      above={
        <>
          {!assembled.ok && <Hint tone="muted"><span role="alert">{assembled.error}</span></Hint>}
          {assembled.ok && <Hint tone="muted">Up to {ASSEMBLE_LIMITS.maxLines} instructions. PUSH takes a number, LOAD and STORE a slot 0 to 3, JMP and JZ an instruction number. Press play, then fix the listing and run again.</Hint>}
        </>
      }
    />
  );
}

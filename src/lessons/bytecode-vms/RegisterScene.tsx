import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { compareExpression } from './compare';
import { EXPRESSION_PRESETS, SAMPLE_SLOTS } from './presets';

/** Scene 4: stack code or register code for one expression. */
export function RegisterScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [text, setText] = useState(EXPRESSION_PRESETS[1].text);
  const cmp = useMemo(() => compareExpression(text), [text]);
  const slots = `a = ${SAMPLE_SLOTS[0]}, b = ${SAMPLE_SLOTS[1]}, c = ${SAMPLE_SLOTS[2]}, d = ${SAMPLE_SLOTS[3]}`;

  useEffect(() => {
    if (!cmp.ok) {
      setCaption(<>{cmp.error}</>, { quiet: true });
      return;
    }
    const { stack, register, stackOut, registerOut } = cmp.value;
    setCaption(
      <>
        Stack code takes <b>{stack.length} instructions</b>, register code <b>{register.length}</b>, for the same expression. With {slots} both print {stackOut}{stackOut === registerOut ? '' : ` and ${registerOut}`}.
      </>,
      { quiet: true },
    );
  }, [setCaption, cmp, slots]);

  return (
    <StageFrame
      height={460}
      stats={
        cmp.ok ? (
          <Stats>
            <Stat label="Stack code" value={cmp.value.stack.length} sub="instructions" color="var(--sky)" />
            <Stat label="Register code" value={cmp.value.register.length} sub="instructions" color="var(--amber)" />
            <Stat label="Both print" value={cmp.value.stackOut === cmp.value.registerOut ? String(cmp.value.stackOut) : 'different values'} color={cmp.value.stackOut === cmp.value.registerOut ? 'var(--ok)' : 'var(--bad)'} sub={slots} />
          </Stats>
        ) : undefined
      }
      legend={<Legend items={[{ color: 'var(--sky)', label: 'stack code', shape: 'square' }, { color: 'var(--amber)', label: 'register code', shape: 'square' }, { color: 'var(--ok)', label: 'both listings print the same value', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <ControlGroup label="Expression" inline>
            {EXPRESSION_PRESETS.map((p) => (
              <ChipButton key={p.label} tone="violet" on={text === p.text} onClick={() => setText(p.text)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <TextField key="f" label="Expression" value={text} onChange={setText} width={300} spellCheck={false} ariaLabel="Expression to compile" />,
      ]}
    >
      <div className="bv stage-pad">
        {!cmp.ok && <Hint tone="muted"><span role="alert">{cmp.error}</span></Hint>}
        {cmp.ok && (
          <div className="bv-cols">
            <Box><SectionTitle hint="operands on a stack">Stack code</SectionTitle><CodePanel lines={cmp.value.stack} /></Box>
            <Box><SectionTitle hint="three-operand, unlimited registers">Register code</SectionTitle><CodePanel lines={cmp.value.register} /></Box>
          </div>
        )}
        <Hint tone="muted">The unit is instructions run to print the value (HALT not counted), with no optimisation on either side. Register VMs spend fewer, wider instructions; whether that wins depends on the machine.</Hint>
        <ProvenanceRow>
          <Provenance kind="toy">two small compilers written for this page, run on the sample slots</Provenance>
          <Provenance kind="from-memory">Lua from version 5.0 and Android’s Dalvik use register VMs: verify against their documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { isaFrames } from './frames';
import { COMMON_FLAGS, MAX_ARM64 } from './listings';
import { HONESTY, PRESETS, type ProgId, type Variant } from './model';
import { StatePanel } from './StatePanel';
import { hex } from './x86';

const STEP_MS = 1500;

type Pin = { side: 'c' | 'asm'; line: number } | null;

export function ProgramScene({ picker, prog }: { picker: ReactNode; prog: ProgId }) {
  const presets = PRESETS[prog];
  const [presetId, setPresetId] = useState(presets[0].id);
  const [v, setV] = useState<Variant>({ cmov: false, unsignedTypes: false });
  const [arm, setArm] = useState(false);
  const [pin, setPin] = useState<Pin>(null);
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];

  const { run, frames } = useMemo(() => isaFrames(prog, v, preset.values), [prog, v, preset]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const k = player.frame.k;
  const effect = k > 0 ? run.effects[k - 1] : null;
  const { listing, program } = run;

  const asmLines = listing.asm.map((l) => (l.label !== undefined ? `${l.label}:` : `    ${l.asm}`));
  const nowAsm = effect ? program.lineOf.indexOf(program.instrs.indexOf(effect.instr)) : -1;
  const nowC = nowAsm >= 0 ? listing.asm[nowAsm].cLine! - 1 : -1;
  const linkedAsm = (i: number) => pin?.side === 'c' && listing.asm[i].cLine === pin.line + 1;
  const linkedC = (i: number) => pin?.side === 'asm' && listing.asm[pin.line].cLine === i + 1;
  const toggle = (side: 'c' | 'asm', line: number) => setPin(pin?.side === side && pin.line === line ? null : { side, line });
  const cState = (i: number): LineState => (i === nowC ? 'now' : linkedC(i) || (pin?.side === 'c' && pin.line === i) ? 'next' : 'idle');
  const asmState = (i: number): LineState => (i === nowAsm ? 'now' : linkedAsm(i) || (pin?.side === 'asm' && pin.line === i) ? 'next' : 'idle');

  const variantControls =
    prog === 'max' ? (
      <>
        <Toggle label="Compiled" value={v.cmov} onChange={(c) => setV({ ...v, cmov: c })} off="With a branch" on="With cmov" />
        <Toggle label="Compare with" value={arm} onChange={setArm} off="x86-64 only" on="ARM64 too" />
      </>
    ) : prog === 'absdiff' ? (
      <Toggle label="Types" value={v.unsignedTypes} onChange={(u) => setV({ ...v, unsignedTypes: u })} off="long" on="unsigned long" />
    ) : null;

  const x86Bytes = listing.endOffset;
  const x86Count = program.instrs.length;
  const sizes = program.instrs.map((i) => i.size);
  const armCount = MAX_ARM64.lines.length - 1;

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label="Instructions run" value={`${k} / ${run.effects.length}`} />
          <Stat label="Code size" value={`${x86Bytes} bytes`} sub={`${x86Count} instructions, ${Math.min(...sizes)}-${Math.max(...sizes)} bytes each`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'instruction just run, and its C line', shape: 'square' },
            { color: 'var(--hi)', label: 'register or flag it changed (tint)', shape: 'square' },
            { color: 'var(--violet)', label: 'flags a jump or cmov read; rsp', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <ControlGroup label="Input" inline className="isa-inputs">
            {presets.map((p) => (
              <ChipButton key={p.id} tone="info" size="md" on={p.id === preset.id} onClick={() => setPresetId(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          {variantControls}
        </>,
      ]}
    >
      <div className="isa stage-pad">
        <div className={`isa-panels ${arm && prog === 'max' ? 'has-arm' : ''}`}>
          <div className="isa-code">
            <CodePanel
              title="C · click a line to find its instructions"
              lines={listing.c}
              stateOf={cState}
              onLineClick={(i) => toggle('c', i)}
              roving
              pressed={(i) => pin?.side === 'c' && pin.line === i}
              lineLabel={(i) => `C line ${i + 1}: ${listing.c[i] || '(blank)'}. Highlight its instructions`}
            />
            <CodePanel
              title={`x86-64 · ${COMMON_FLAGS}${listing.extraFlags ? ` ${listing.extraFlags}` : ''}`}
              lines={asmLines}
              stateOf={asmState}
              trailing={(i) => (listing.asm[i].asm ? hex(run.program.instrs[run.program.lineOf[i]!].addr) : '')}
              onLineClick={(i) => toggle('asm', i)}
              roving
              pressed={(i) => pin?.side === 'asm' && pin.line === i}
              lineLabel={(i) => `Assembly line ${i + 1}: ${asmLines[i].trim()}. Highlight its C line`}
            />
            {arm && prog === 'max' && (
              <div className="isa-arm">
                <CodePanel title="AArch64 · typical gcc -O1 output, not compiled for this lesson" lines={MAX_ARM64.lines} />
                <Hint block>
                  x86-64 here: {x86Count} instructions in {x86Bytes} bytes, of different lengths. AArch64: {armCount} instructions, always 4 bytes each ({MAX_ARM64.bytes} bytes), and 31 general registers
                  against x86-64's 16. csel is ARM's cmov.
                </Hint>
              </div>
            )}
          </div>
          <StatePanel run={run} k={k} effect={effect} v={v} />
        </div>
        <Hint block>{HONESTY}</Hint>
      </div>
    </StageFrame>
  );
}

import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { applyWrite, bytesOf, START_VALUE, VIEWS, WIDTH_WRITES, widthStart, type ByteChange, type WidthResult, type WidthWrite } from './widths';
import { hex } from '../../core/x86';

const BYTE_W = 40;
const BYTE_H = 34;
const GAP = 4;
const BRACKET_GAP = 22;
const TOP = 6;
const W = 8 * BYTE_W + 7 * GAP;
const H = TOP + BYTE_H + 12 + VIEWS.length * BRACKET_GAP;
/** Room left of the bytes for the register names. */
const NAME_W = 36;

const hex2 = (b: number) => b.toString(16).padStart(2, '0');

function say(asm: WidthWrite, r: WidthResult): ReactNode {
  const zeroed = r.change.includes('zeroed');
  const kept = r.change.filter((c) => c === 'kept').length;
  return (
    <>
      <code>{asm}</code>: rax {hex(r.before)} → <span className="hl info">{hex(r.after)}</span>.{' '}
      {zeroed ? (
        <>
          A 32-bit write <span className="hl orange">zeroes the top 4 bytes</span>, whatever was there. That rule is why <code>mov edx, 0</code> in sum clears all of rdx.
        </>
      ) : kept ? (
        <>The other {kept} bytes are left exactly as they were: 8- and 16-bit writes merge.</>
      ) : (
        <>A 64-bit write replaces every byte.</>
      )}
    </>
  );
}

export function WidthsScene({ picker }: { picker: ReactNode }) {
  const [cpu, setCpu] = useState(widthStart);
  const [last, setLast] = useState<WidthResult | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(<>rax is 64 bits; eax, ax and al are names for its low 4, 2 and 1 bytes. Write through each name and watch which bytes change.</>);

  const write = (asm: WidthWrite) => {
    const r = applyWrite(cpu, asm);
    setCpu(r.cpu);
    setLast(r.result);
    setCaption(say(asm, r.result));
  };
  const bytes = bytesOf(cpu.regs.rax);
  const change = (i: number): ByteChange | null => last?.change[i] ?? null;

  return (
    <StageFrame
      height={300}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'bytes the write set', shape: 'square' },
            { color: 'var(--orange)', label: 'bytes zeroed by a 32-bit write', shape: 'square' },
            { color: 'var(--violet)', label: 'register names', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="w" label="Write" inline className="isa-writes">
          {WIDTH_WRITES.map((w) => (
            <ChipButton key={w} tone="info" size="md" onClick={() => write(w)}>
              <code>{w}</code>
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="isa-widths stage-pad">
        <svg className="isa-widths-svg" viewBox={`${-NAME_W} 0 ${W + NAME_W + 4} ${H}`} width={W + NAME_W + 4} role="img" aria-label={`rax = ${hex(cpu.regs.rax)}, drawn as 8 bytes with eax, ax and al marked as its low bytes`}>
          {bytes.map((b, i) => {
            const x = i * (BYTE_W + GAP);
            const c = change(i);
            return (
              <g key={i} className={`isa-byte ${c ? `is-${c}` : ''}`}>
                <rect x={x} y={TOP} width={BYTE_W} height={BYTE_H} rx={5} />
                <text x={x + BYTE_W / 2} y={TOP + BYTE_H / 2 + 5}>
                  {hex2(b)}
                </text>
              </g>
            );
          })}
          {VIEWS.map((v, k) => {
            const x0 = (8 - v.bytes) * (BYTE_W + GAP);
            const x1 = W;
            const y = TOP + BYTE_H + 12 + k * BRACKET_GAP;
            return (
              <g key={v.name} className="isa-view">
                <path d={`M${x0 + 2},${y - 6} V${y} H${x1 - 2} V${y - 6}`} />
                <text x={x0 - 6} y={y + 4}>
                  {v.name}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="isa-widths-value">
          rax = <b>{hex(cpu.regs.rax)}</b>
          {cpu.regs.rax === START_VALUE ? ' (the starting value)' : ''}
        </p>
        <Hint block>Same rule for every register: ebx, ecx, r8d… all zero-extend; bl, cx, r8b… merge. The bytes run most significant first, as you'd write the number.</Hint>
      </div>
    </StageFrame>
  );
}

import { useArrowMarker } from '../../components/ArrowMarker';
import type { ChainMode } from './model';

const W = 560;
const H = 200;
const COLS = 4;
const COL_W = W / COLS;
const BOX = { w: 92, h: 26 };
/** Row centres, top to bottom. */
const Y = { top: 22, xor1: 66, aes: 104, xor2: 144, out: 180 } as const;

function Box({ x, y, label, cls }: { x: number; y: number; label: string; cls: string }) {
  return (
    <g className={`sc-dbox ${cls}`}>
      <rect x={x - BOX.w / 2} y={y - BOX.h / 2} width={BOX.w} height={BOX.h} rx={6} />
      <text x={x} y={y + 4}>{label}</text>
    </g>
  );
}

function Xor({ x, y }: { x: number; y: number }) {
  return (
    <g className="sc-dxor">
      <circle cx={x} cy={y} r={10} />
      <path d={`M ${x - 10} ${y} H ${x + 10} M ${x} ${y - 10} V ${y + 10}`} />
    </g>
  );
}

/**
 * How each block is encrypted in the chosen mode, four blocks side by side. Plaintext boxes
 * that were flipped and ciphertext boxes that changed are lit.
 */
export function ModeDiagram({ mode, changed, flippedBlocks }: { mode: ChainMode; changed: number[]; flippedBlocks: number[] }) {
  const arrow = useArrowMarker('var(--line-2)', { size: 6, refX: 9 });
  const cx = (i: number) => COL_W * i + COL_W / 2;
  const line = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <line key={key} className="sc-dline" x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={arrow.url} />
  );
  return (
    <svg className="sc-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${mode} mode: how each of the four blocks is encrypted`}>
      {arrow.def}
      {Array.from({ length: COLS }, (_, i) => {
        const x = cx(i);
        const p = <Box x={x} y={Y.top} label={`P${i + 1}`} cls={`is-plain ${flippedBlocks.includes(i) ? 'is-lit' : ''}`} />;
        const c = <Box x={x} y={Y.out} label={`C${i + 1}`} cls={`is-cipher ${changed.includes(i) ? 'is-lit' : ''}`} />;
        const aes = <Box x={x} y={Y.aes} label="AES (key)" cls="is-aes" />;
        if (mode === 'ECB') {
          return (
            <g key={i}>
              {p}{aes}{c}
              {line(x, Y.top + BOX.h / 2, x, Y.aes - BOX.h / 2 - 2, 'a')}
              {line(x, Y.aes + BOX.h / 2, x, Y.out - BOX.h / 2 - 2, 'b')}
            </g>
          );
        }
        if (mode === 'CBC') {
          const from = i === 0 ? { x: 8, y: Y.xor1 } : { x: cx(i - 1) + BOX.w / 2, y: Y.out };
          return (
            <g key={i}>
              {p}{aes}{c}
              <Xor x={x} y={Y.xor1} />
              {i === 0 && <text className="sc-dlabel" x={14} y={Y.xor1 - 8}>IV</text>}
              {line(x, Y.top + BOX.h / 2, x, Y.xor1 - 12, 'a')}
              {line(from.x, from.y, x - 11, Y.xor1, 'chain')}
              {line(x, Y.xor1 + 10, x, Y.aes - BOX.h / 2 - 2, 'b')}
              {line(x, Y.aes + BOX.h / 2, x, Y.out - BOX.h / 2 - 2, 'c')}
            </g>
          );
        }
        return (
          <g key={i}>
            <Box x={x} y={Y.top} label={i === 0 ? 'ctr' : `ctr+${i}`} cls="is-counter" />
            {aes}
            <Box x={x} y={Y.xor1} label={`P${i + 1}`} cls={`is-plain ${flippedBlocks.includes(i) ? 'is-lit' : ''}`} />
            <Xor x={x} y={Y.xor2} />
            {c}
            {line(x, Y.top + BOX.h / 2, x, Y.aes - BOX.h / 2 - 2, 'a')}
            {line(x, Y.aes + BOX.h / 2, x, Y.xor2 - 12, 'b')}
            {line(x + BOX.w / 2, Y.xor1, x + 12, Y.xor2 - 6, 'p')}
            {line(x, Y.xor2 + 10, x, Y.out - BOX.h / 2 - 2, 'c')}
          </g>
        );
      })}
    </svg>
  );
}

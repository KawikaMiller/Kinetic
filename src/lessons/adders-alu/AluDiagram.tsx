import type { AluOp } from './model';

const W = 520;
const H = 220;
const UNIT_X = 30;
const UNIT_W = 170;
const MUX = { left: 300, right: 340, top: 20, bottom: 190 };
const OUT = { x: 390, w: 110, h: 44 };

interface Unit {
  id: 'adder' | 'and' | 'or';
  title: string;
  y: number;
  h: number;
}

const UNITS: readonly Unit[] = [
  { id: 'adder', title: 'Adder', y: 20, h: 62 },
  { id: 'and', title: 'AND', y: 100, h: 38 },
  { id: 'or', title: 'OR', y: 152, h: 38 },
];

const unitFor = (op: AluOp): Unit['id'] => (op === 'AND' ? 'and' : op === 'OR' ? 'or' : 'adder');

/** The ALU as blocks: three units all compute every time, and the mux passes on the one the op selects. */
export function AluDiagram({ op, result }: { op: AluOp; result: string }) {
  const chosen = unitFor(op);
  const muxMid = (MUX.top + MUX.bottom) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="aa-svg aa-alu" role="img" aria-label={`ALU with ${op} selected`}>
      {UNITS.map((u) => {
        const on = u.id === chosen;
        const cy = u.y + u.h / 2;
        return (
          <g key={u.id} className={`aa-unit-box ${on ? 'is-selected' : ''}`}>
            <rect x={UNIT_X} y={u.y} width={UNIT_W} height={u.h} rx={8} />
            <text x={UNIT_X + UNIT_W / 2} y={u.id === 'adder' ? u.y + 26 : cy + 5} textAnchor="middle" className="aa-unit-title">{u.title}</text>
            {u.id === 'adder' && (
              <text x={UNIT_X + UNIT_W / 2} y={u.y + 48} textAnchor="middle" className="aa-unit-sub">
                {op === 'SUB' ? 'A + ~B + 1 (Cin = 1)' : 'A + B (Cin = 0)'}
              </text>
            )}
            <path d={`M ${UNIT_X + UNIT_W} ${cy} H ${MUX.left}`} className="aa-path" />
          </g>
        );
      })}
      <path d={`M ${MUX.left} ${MUX.top} L ${MUX.right} ${MUX.top + 30} L ${MUX.right} ${MUX.bottom - 30} L ${MUX.left} ${MUX.bottom} Z`} className="aa-mux" />
      <text x={(MUX.left + MUX.right) / 2} y={muxMid + 4} textAnchor="middle" className="aa-mux-label">MUX</text>
      <path d={`M ${(MUX.left + MUX.right) / 2} ${H - 6} V ${MUX.bottom - 14}`} className="aa-path is-select" />
      <text x={(MUX.left + MUX.right) / 2 + 8} y={H - 8} className="aa-select-label">op = {op}</text>
      <path d={`M ${MUX.right} ${muxMid} H ${OUT.x}`} className="aa-path is-out" />
      <rect x={OUT.x} y={muxMid - OUT.h / 2} width={OUT.w} height={OUT.h} rx={8} className="aa-out" />
      <text x={OUT.x + OUT.w / 2} y={muxMid + 6} textAnchor="middle" className="aa-out-value">{result}</text>
    </svg>
  );
}

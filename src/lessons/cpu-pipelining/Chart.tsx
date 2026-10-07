import { useId } from 'react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import type { PipeRun } from './frames';
import { CHART_SIZE, rowLabel, STAGE_TONE } from './chartLayout';
import type { Instr, Row } from './model';

const isWait = (row: Row, c: number) => {
  const k = row.cells[c];
  return k?.kind === 'port-wait' || (k?.kind === 'stage' && k.held);
};

export function Chart({ run, program, cycle }: { run: PipeRun; program: readonly Instr[]; cycle: number }) {
  const hatch = `pl-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const arrow = useArrowMarker('var(--info)', { size: 6, refX: 9 });
  const { rows, totalCycles } = run;
  const flushedNow = (row: Row) => row.flushedAt !== null && row.flushedAt <= cycle;

  const cell = (r: number, c: number): GridCellSpec => {
    const cyc = c + 1;
    const row = rows[r];
    const k = row.cells[cyc];
    if (cyc > cycle || !k) return {};
    if (isWait(row, cyc)) return { tone: 'dim', fill: 'tint', intensity: 0.5 };
    if (k.kind !== 'stage') return {};
    if (flushedNow(row)) return { text: k.stage, tone: 'bad', fill: 'outline' };
    return { text: k.stage, tone: STAGE_TONE[k.stage], fill: 'tint', intensity: 0.34 };
  };
  const title = (r: number, c: number) => {
    const row = rows[r];
    const k = row.cells[c + 1];
    const what = !k || c + 1 > cycle ? 'empty' : k.kind === 'port-wait' ? 'waiting to be fetched (memory port busy)' : k.held ? `stalled in ${k.stage}` : flushedNow(row) ? `${k.stage}, flushed` : k.stage;
    return `${rowLabel(program, row)}, cycle ${c + 1}: ${what}`;
  };

  const forwards = (run.result?.forwards ?? []).filter((f) => f.cycle <= cycle);

  return (
    <CellGrid
      className="pl-chart"
      rows={rows.length}
      cols={totalCycles}
      size={CHART_SIZE}
      cell={cell}
      cellTitle={title}
      rowLabels={rows.map((r) => rowLabel(program, r))}
      colLabels={Array.from({ length: totalCycles }, (_, c) => String(c + 1))}
      ariaLabel={`Pipeline chart: ${rows.length} instructions over ${totalCycles} cycles, showing cycle ${cycle}`}
      overlay={({ at, center, cell: size, height }) => (
        <>
          <defs>
            {arrow.def}
            <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line className="pl-hatch" x1="0" y1="0" x2="0" y2="5" />
            </pattern>
          </defs>
          {rows.flatMap((row, r) =>
            Object.keys(row.cells)
              .map(Number)
              .filter((cyc) => cyc <= cycle && isWait(row, cyc))
              .map((cyc) => {
                const p = at(r, cyc - 1);
                return <rect key={`w${r}-${cyc}`} className="pl-wait" x={p.x} y={p.y} width={size} height={size} rx={4} fill={`url(#${hatch})`} />;
              }),
          )}
          {rows.flatMap((row, r) =>
            flushedNow(row)
              ? Object.keys(row.cells)
                  .map(Number)
                  .filter((cyc) => cyc <= cycle)
                  .map((cyc) => {
                    const p = at(r, cyc - 1);
                    return <line key={`x${r}-${cyc}`} className="pl-strike" x1={p.x + 4} y1={p.y + size / 2} x2={p.x + size - 4} y2={p.y + size / 2} />;
                  })
              : [],
          )}
          {forwards.map((f, i) => {
            const a = center(f.fromRow, f.cycle - 2);
            const b = center(f.toRow, f.cycle - 1);
            return <line key={`f${i}`} className="pl-forward" x1={a.x + 6} y1={a.y + 8} x2={b.x - 6} y2={b.y - 9} markerEnd={arrow.url} />;
          })}
          {cycle > 0 && (
            <rect className="pl-now" x={at(0, cycle - 1).x - 2.5} y={at(0, 0).y - 2.5} width={size + 5} height={height - at(0, 0).y + 1} rx={6} />
          )}
        </>
      )}
    />
  );
}

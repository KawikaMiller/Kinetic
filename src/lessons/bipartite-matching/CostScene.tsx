import { useState, type ReactNode } from 'react';
import { CellGrid, type GridHighlight } from '../../components/CellGrid';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { COST_MAX, COST_MIN, DEFAULT_COSTS, assignmentCost, greedyAssignment, hungarian, jobName, setCost, workerName, type CostMatrix } from './model';
import { costCaption } from './text';

export function CostScene({ picker }: { picker: ReactNode }) {
  const [costs, setCosts] = useState<CostMatrix>(DEFAULT_COSTS);
  const [cell, setCell] = useState<{ r: number; c: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const greedy = greedyAssignment(costs);
  const best = hungarian(costs);
  const greedyCost = assignmentCost(costs, greedy);
  const bestCost = assignmentCost(costs, best);
  const caption = costCaption(costs, greedy, best);

  const pick = (r: number, c: number) => {
    setCell({ r, c });
    setDraft(String(costs[r][c]));
    setNote(`Editing ${workerName(r)} on ${jobName(c)}: type a cost from ${COST_MIN} to ${COST_MAX} and press Enter.`);
  };
  const apply = () => {
    if (!cell) return;
    const parsed = parseBoundedInt(draft, { min: COST_MIN, max: COST_MAX, messages: { empty: 'Type a whole number.', invalid: () => 'Type a whole number.', tooSmall: () => `Costs start at ${COST_MIN}.`, tooBig: () => `Costs stop at ${COST_MAX}.` } });
    if (!parsed.ok) {
      setNote(`${parsed.error} ${workerName(cell.r)} on ${jobName(cell.c)} stays ${costs[cell.r][cell.c]}.`);
      setDraft(String(costs[cell.r][cell.c]));
      return;
    }
    setCosts(setCost(costs, cell.r, cell.c, parsed.value));
    setNote(`${workerName(cell.r)} on ${jobName(cell.c)} now costs ${parsed.value}.`);
  };
  const rings: GridHighlight[] = [...greedy.map((c, r): GridHighlight => ({ r, c, tone: 'orange' }))];
  if (cell) rings.push({ r: cell.r, c: cell.c, tone: 'hi' });
  const label = (a: readonly number[]) => a.map((c, r) => `${workerName(r)}-${jobName(c)}`).join(', ');

  return (
    <StageFrame
      intro={caption}
      introKey={[caption]}
      height={470}
      stats={
        <Stats>
          <Stat label="Greedy per row" value={greedyCost} color="var(--orange)" sub={label(greedy)} />
          <Stat label="Optimal assignment" value={bestCost} color="var(--ok)" sub={label(best)} />
          <Stat label="Greedy gap" value={greedyCost - bestCost} color={greedyCost > bestCost ? 'var(--bad)' : 'var(--ok)'} sub={greedyCost > bestCost ? 'extra cost from choosing row by row' : 'greedy is optimal here'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'greedy per row picks this job', shape: 'square' },
            { color: 'var(--ok)', label: 'optimal assignment', shape: 'square' },
            { color: 'var(--hi)', label: 'cell being edited', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField
            label={cell ? `Cost of ${workerName(cell.r)} on ${jobName(cell.c)}` : 'Cost'}
            value={draft}
            onChange={setDraft}
            onEnter={apply}
            disabled={!cell}
            width={70}
            maxLength={3}
            placeholder={`${COST_MIN}-${COST_MAX}`}
          />
          <Button onClick={apply} disabled={!cell}>
            Set cost
          </Button>
          <Button onClick={() => { setCosts(DEFAULT_COSTS); setCell(null); setNote('Costs reset to the default matrix.'); }}>Reset costs</Button>
        </>,
      ]}
    >
      <div className="bm-stage stage-pad">
        <p className="bm-note" role="status">
          {note}
        </p>
        <Tray label="Cost of giving each worker (row) each job (column)" labelWeight="regular" stack ariaLabel="Cost matrix">
          <CellGrid
            rows={costs.length}
            cols={costs.length}
            size="md"
            rowLabels={costs.map((_, r) => workerName(r))}
            colLabels={costs.map((_, c) => jobName(c))}
            highlight={rings}
            cell={(r, c) => (best[r] === c ? { text: costs[r][c], tone: 'ok', fill: 'solid' } : { text: costs[r][c], tone: 'muted', fill: 'outline' })}
            onCellClick={pick}
            cellAriaLabel={(r, c) => `${workerName(r)} on ${jobName(c)} costs ${costs[r][c]}${best[r] === c ? ', in the optimal assignment' : ''}${greedy[r] === c ? ', picked by greedy' : ''}. Press to edit`}
            ariaLabel="Cost matrix"
          />
        </Tray>
        <Hint tone="muted" block>
          The Hungarian method (named here, steps not animated) finds the optimal assignment in O(n³); the tests check it against trying every permutation. Greedy per row has each worker, in order, take the cheapest job still free, so an early cheap pick can force a dear one later.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">costs and both assignments are computed live; the Hungarian steps are computed, not animated</Provenance>
        <Provenance kind="illustrative">the default costs are invented numbers</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { diagonalCaption } from './captions';
import { dOnItself, dRow, flip, GRID_SIZE, randomClaims, rowsEqualToD, type Cell, type Claims, type Stage } from './diagonal';

/** The table is one row and one column larger than the visible part so the D row and the D input can appear in place. */
const FULL = GRID_SIZE + 1;
const FIRST_SEED = 1;
const STAGES = [
  { value: 'table', label: '1 Fill the table' },
  { value: 'built', label: '2 Build D' },
  { value: 'self', label: '3 Ask about D on D' },
] as const;
const ROW_LABELS = [...Array.from({ length: GRID_SIZE }, (_, i) => `P${i}`), 'D'];
const COL_LABELS = [...Array.from({ length: GRID_SIZE }, (_, i) => `${i}`), 'D'];
const cellTone = (c: Cell): Tone => (c === 'H' ? 'ok' : 'orange');
const diagonalRings = (stage: Stage) =>
  Array.from({ length: GRID_SIZE }, (_, i) => (stage === 'table' ? [{ r: i, c: i, tone: 'hi' as const }] : [{ r: i, c: i, tone: 'bad' as const }, { r: GRID_SIZE, c: i, tone: 'bad' as const }])).flat();

/** Scene 1: a table of claims the learner fills in, D built from its diagonal, and D asked about itself. */
export function DiagonalScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [seed, setSeed] = useState(FIRST_SEED);
  const [claims, setClaims] = useState<Claims>(() => randomClaims(FULL, FIRST_SEED));
  const [stage, setStage] = useState<Stage>('table');
  const [selected, setSelected] = useState(0);

  const rows = stage === 'table' ? GRID_SIZE : FULL;
  const cols = stage === 'self' ? FULL : GRID_SIZE;
  const d = useMemo(() => dRow(claims, GRID_SIZE), [claims]);
  const equal = rowsEqualToD(claims, GRID_SIZE);
  const differAtOwn = claims.slice(0, GRID_SIZE).filter((row, i) => row[i] !== d[i]).length;
  const self = dOnItself(claims[GRID_SIZE][GRID_SIZE]);

  useEffect(() => {
    setCaption(diagonalCaption(stage, claims, selected), { quiet: true });
  }, [setCaption, stage, claims, selected]);

  const editable = (r: number, c: number) => (r < GRID_SIZE ? c < cols : stage === 'self' && r === GRID_SIZE && c === GRID_SIZE);
  const toggle = (r: number, c: number) => {
    if (!editable(r, c)) return;
    setClaims(claims.map((row, i) => (i === r ? row.map((v, j) => (j === c ? flip(v) : v)) : row)));
  };
  const randomise = () => {
    setSeed(seed + 1);
    setClaims(randomClaims(FULL, seed + 1));
  };

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          {stage === 'table' && <Stat label="D would be" value={d.join(' ')} color="var(--violet)" sub="the opposite of the diagonal, cell by cell" />}
          {stage !== 'table' && <Stat label="Rows equal to D" value={`${equal.length} of ${GRID_SIZE}`} color={equal.length === 0 ? 'var(--ok)' : 'var(--bad)'} sub="on the six inputs shown" />}
          {stage !== 'table' && <Stat label="Differ from D at their own diagonal" value={`${differAtOwn} of ${GRID_SIZE}`} color="var(--bad)" />}
          {stage === 'self' && <Stat label="Claim for D on D" value={claims[GRID_SIZE][GRID_SIZE]} sub={`D really ${self.dDoes === 'H' ? 'halts' : 'loops'}: the claim is wrong`} color="var(--bad)" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'H: the decider claims it halts', shape: 'square' },
            { color: 'var(--orange)', label: 'L: it claims the program loops', shape: 'square' },
            { color: 'var(--hi)', label: 'the diagonal: a program on its own number', shape: 'square' },
            { color: 'var(--violet)', label: 'D’s row', shape: 'square' },
            { color: 'var(--bad)', label: 'where a row differs from D', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Step" value={stage} onChange={setStage} options={[...STAGES]} />
        </>,
        <>
          <Button onClick={randomise}>Randomise the claims</Button>
          <Hint tone="muted">Seeded table, seed {seed}</Hint>
          {stage !== 'table' && (
            <Segmented
              label="Compare row"
              value={selected}
              onChange={setSelected}
              options={Array.from({ length: GRID_SIZE }, (_, i) => ({ value: i, label: `P${i}` }))}
            />
          )}
        </>,
      ]}
    >
      <div className="hp stage-pad">
        <CellGrid
          rows={rows}
          cols={cols}
          size="md"
          rowLabels={ROW_LABELS.slice(0, rows)}
          colLabels={COL_LABELS.slice(0, cols)}
          ariaLabel="Claims table: row i is program P_i, column j is input j, each cell says H (halts) or L (loops)"
          cell={(r, c) => {
            if (r === GRID_SIZE && c < GRID_SIZE) return { text: d[c], tone: 'violet', fill: 'tint' };
            return { text: claims[r][c], tone: cellTone(claims[r][c]), fill: 'tint' };
          }}
          onCellClick={toggle}
          cellAriaLabel={(r, c) => {
            const who = r === GRID_SIZE ? 'D' : `program ${r}`;
            const on = c === GRID_SIZE ? 'input D' : `input ${c}`;
            const v = r === GRID_SIZE && c < GRID_SIZE ? d[c] : claims[r][c];
            return `${who} on ${on}: ${v === 'H' ? 'halts' : 'loops'}${editable(r, c) ? ', press to flip' : ', fixed by the diagonal'}`;
          }}
          highlight={stage === 'self' ? [...diagonalRings(stage), { r: GRID_SIZE, c: GRID_SIZE, tone: 'bad' as const }] : diagonalRings(stage)}
          rowDecor={(r) => (stage === 'table' ? null : r === GRID_SIZE ? { tone: 'violet' } : r === selected ? { tone: 'info' } : null)}
        />
        <ProvenanceRow>
          <Provenance kind="toy">a 6 x 6 picture of the diagonal argument: the cells are your claims, not real programs</Provenance>
          <ClaimLabel kind="standard">the general theorem (Turing, 1936) is this argument over all programs: argued here, not run</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { arrowMarkerDef } from '../../components/ArrowMarker';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { usePlayer } from '../../core/usePlayer';
import { isFilled, tableFrames } from './frames';
import { hamming, MAX_WORD, parseWord, WORD_PRESETS, type Tinted } from './model';
import { editTable, INDEL, LEVENSHTEIN, type Source } from '../../core/editDistance';

const STEP_MS = 650;
const GRID_SIZE = { cell: 34, font: 13 };
/** Above this many columns the table scrolls sideways on a phone instead of shrinking. */
const WIDE_COLS = 8;
const WIDE_MIN = 480;
const OFFSET: Record<Source, [number, number]> = { diag: [-1, -1], up: [-1, 0], left: [0, -1] };
const ARROW_HI = 'ed-arrow-hi';
const ARROW_VIOLET = 'ed-arrow-violet';
/** Arrow ends, in grid units from the cell centres: the target's half-width puts the tip on its edge. */
const ARROW_TRIM = { start: 9, end: GRID_SIZE.cell / 2, diagonalEnd: (GRID_SIZE.cell / 2) * Math.SQRT2 };

export function TableScene({ picker }: { picker: ReactNode }) {
  const [a, setA] = useState<string>(WORD_PRESETS[0].a);
  const [b, setB] = useState<string>(WORD_PRESETS[0].b);
  const [draftA, setDraftA] = useState<string>(WORD_PRESETS[0].a);
  const [draftB, setDraftB] = useState<string>(WORD_PRESETS[0].b);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<1 | 2>(1);
  const costs = sub === 1 ? LEVENSHTEIN : INDEL;

  const frames = useMemo(() => tableFrames(a, b, costs), [a, b, costs]);
  const table = useMemo(() => editTable(a, b, costs), [a, b, costs]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const m = table.a.length;
  const n = table.b.length;
  const h = hamming(a, b);

  const load = (x: string, y: string) => {
    setA(x);
    setB(y);
    setDraftA(x);
    setDraftB(y);
    setError(null);
  };
  const apply = () => {
    const ra = parseWord(draftA);
    if (!ra.ok) return setError(`Word A: ${ra.error}`);
    const rb = parseWord(draftB);
    if (!rb.ok) return setError(`Word B: ${rb.error}`);
    load(ra.value, rb.value);
  };

  const onPath = new Set(f.path.map(([i, j]) => `${i},${j}`));
  const sources = f.cur && f.cands
    ? (Object.keys(OFFSET) as Source[]).map((s) => [f.cur![0] + OFFSET[s][0], f.cur![1] + OFFSET[s][1]] as const)
    : [];
  const cell = (r: number, c: number): GridCellSpec => {
    const filled = isFilled(f, r, c, n);
    const text = filled ? table.d[r][c] : '';
    if (f.cur && f.cur[0] === r && f.cur[1] === c) return { tone: 'hi', fill: 'solid', text };
    if (onPath.has(`${r},${c}`)) return { tone: 'violet', fill: 'solid', text };
    if (sources.some(([i, j]) => i === r && j === c)) return { tone: 'info', fill: 'tint', intensity: 0.3, text };
    return filled ? { tone: 'muted', fill: 'tint', intensity: 0.22, text } : { fill: 'outline' };
  };

  const grid = (
    <CellGrid
      rows={m + 1}
      cols={n + 1}
      size={GRID_SIZE}
      rowLabels={['ε', ...table.a]}
      colLabels={['ε', ...table.b]}
      cell={cell}
      className="ed-grid"
      ariaLabel={`Edit distance table for ${a || 'the empty word'} and ${b || 'the empty word'}; ${f.cells} of ${m * n} inner cells filled`}
      overlay={({ center }) => (
        <g className="ed-arrows">
          <defs>
            {arrowMarkerDef(ARROW_HI, 'var(--hi)', 5, 9)}
            {arrowMarkerDef(ARROW_VIOLET, 'var(--violet)', 5, 9)}
          </defs>
          {f.cur && f.cands && (
            <Arrow from={center(f.cur[0] + OFFSET[f.cands.win][0], f.cur[1] + OFFSET[f.cands.win][1])} to={center(f.cur[0], f.cur[1])} marker={ARROW_HI} className="is-hi" />
          )}
          {f.path.slice(1).map(([i, j], k) => (
            <Arrow key={`${i},${j}`} from={center(f.path[k][0], f.path[k][1])} to={center(i, j)} marker={ARROW_VIOLET} className="is-violet" />
          ))}
        </g>
      )}
    />
  );

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Edit distance" value={f.phase === 'fill' ? '…' : table.d[m][n]} color="var(--violet)" sub={f.phase === 'fill' ? 'still filling' : `D[${m}][${n}]`} />
          <Stat label="Hamming" value={h === null ? '–' : h} color="var(--muted)" sub={h === null ? 'lengths differ' : 'position by position'} />
          <Stat label="Cells" value={`${f.cells} / ${m * n}`} color="var(--hi)" sub="filled" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'computing now' },
            { color: 'var(--info)', label: 'its three candidates' },
            { color: 'var(--violet)', label: 'traceback path' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Substitute costs" value={sub} onChange={setSub} options={[{ value: 1, label: '1' }, { value: 2, label: '2' }]} />
        </>,
        <>
          <TextField label="Word A" value={draftA} onChange={setDraftA} onEnter={apply} width={140} spellCheck={false} />
          <TextField label="Word B" value={draftB} onChange={setDraftB} onEnter={apply} width={140} spellCheck={false} />
          <Button onClick={apply}>Apply</Button>
          <ControlGroup label="Presets" inline>
            {WORD_PRESETS.map((p) => (
              <ChipButton key={p.a} tone="info" on={a === p.a && b === p.b} onClick={() => load(p.a, p.b)}>
                {p.a} → {p.b}
              </ChipButton>
            ))}
          </ControlGroup>
          <Hint tone={error ? 'muted' : 'faint'} className="ed-note">
            <span role="status">{error ?? `Up to ${MAX_WORD} characters each; a word may be empty.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="ed stage-pad">
        <div className="ed-main">
          {n + 1 > WIDE_COLS ? (
            <WideRegion minWidth={WIDE_MIN} label="Edit distance table: scroll sideways to see all of it">
              {grid}
            </WideRegion>
          ) : (
            grid
          )}
          <div className="ed-side">
            <Box className="ed-cands">
              <SectionTitle>Candidates</SectionTitle>
              {f.cands && f.cur ? (
                <ul className="ed-cand-list">
                  <Cand on={f.cands.win === 'left'} name="left: insert" value={f.cands.left} />
                  <Cand on={f.cands.win === 'up'} name="above: delete" value={f.cands.up} />
                  <Cand on={f.cands.win === 'diag'} name={f.cands.match ? 'diagonal: match' : 'diagonal: substitute'} value={f.cands.diag} />
                </ul>
              ) : (
                <p className="empty-note">shown while a cell is computed</p>
              )}
            </Box>
            <Tray stack label="Replay on word A" className="ed-replay" empty="after the traceback">
              {f.letters?.length ? <Letters letters={f.letters} /> : null}
            </Tray>
          </div>
        </div>
        <Hint block>Nothing simulated: computed live. Real diff tools use faster algorithms that give the same kind of answer.</Hint>
      </div>
    </StageFrame>
  );
}

function Cand({ on, name, value }: { on: boolean; name: string; value: number }) {
  return (
    <li className={on ? 'is-win' : undefined}>
      <span>{name}</span>
      <b>{value}</b>
    </li>
  );
}

function Letters({ letters }: { letters: Tinted[] }) {
  return (
    <span className="ed-letters">
      {letters.map((l, k) => (
        <span key={k} className={`ed-letter is-${l.kind}`}>
          {l.ch}
        </span>
      ))}
    </span>
  );
}

function Arrow({ from, to, marker, className }: { from: { x: number; y: number }; to: { x: number; y: number }; marker: string; className: string }) {
  // Start clear of the source's number and end on the target cell's edge, so no digit is covered.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const startTrim = ARROW_TRIM.start;
  const endTrim = (dx && dy ? ARROW_TRIM.diagonalEnd : ARROW_TRIM.end);
  return (
    <line
      className={`ed-arrow ${className}`}
      x1={from.x + (dx / len) * startTrim}
      y1={from.y + (dy / len) * startTrim}
      x2={to.x - (dx / len) * endTrim}
      y2={to.y - (dy / len) * endTrim}
      markerEnd={`url(#${marker})`}
    />
  );
}

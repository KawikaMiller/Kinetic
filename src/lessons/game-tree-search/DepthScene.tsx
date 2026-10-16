import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { BOARD_PRESETS, BRANCHINGS, DEPTH_MAX, OPENING } from './presets';
import { evaluate, FULL_DEPTH, moveScores, searchBoard, sideToMove, WIN } from './ttt';

const CELL = { cell: 64, font: 20 };
const OUTCOME = (v: number) => (v >= WIN ? 'a win' : v <= -WIN ? 'a loss' : 'a draw');

/** The b^d growth, written out in full as a bigint. */
const growth = (b: number, d: number): bigint => BigInt(b) ** BigInt(d);

/** Scene 4, when the tree is too big: a depth limit, a heuristic below the limit, and the horizon effect. */
export function DepthScene({ picker }: { picker: ReactNode }) {
  const [presetId, setPresetId] = useState<string>(OPENING.depth.preset);
  const [depth, setDepth] = useState<number>(OPENING.depth.depth);
  const [branching, setBranching] = useState<number>(OPENING.growth.branching);
  const [plies, setPlies] = useState<number>(OPENING.growth.depth);

  const { board } = BOARD_PRESETS.find((p) => p.id === presetId)!;
  const mark = sideToMove(board);
  const limited = useMemo(() => moveScores(board, mark, depth), [board, mark, depth]);
  const perfect = useMemo(() => moveScores(board, mark, FULL_DEPTH), [board, mark]);
  const chosen = useMemo(() => searchBoard(board, mark, { prune: true, depth }), [board, mark, depth]);
  const bestPerfect = Math.max(...perfect.map((s) => s.value));
  const perfectOf = (cell: number) => perfect.find((s) => s.cell === cell)!.value;
  const chosenValue = chosen.move === null ? 0 : perfectOf(chosen.move);
  const misjudged = chosenValue < bestPerfect;
  const bestCells = perfect.filter((s) => s.value === bestPerfect).map((s) => s.cell);
  const limitedOf = (cell: number) => limited.find((s) => s.cell === cell)?.value;

  return (
    <StageFrame
      height={500}
      intro={
        <>
          At depth {depth} the machine ({mark}) picks cell {chosen.move}, scoring {chosen.value} by looking {depth} ply{depth === 1 ? '' : 's'} ahead and then counting open lines. Played out to the end that move is {OUTCOME(chosenValue)}; the best available is {OUTCOME(bestPerfect)}. {misjudged ? 'The decisive move sits just past the horizon, so the shallow search misjudges it.' : 'At this depth the choice is as good as perfect play.'}
        </>
      }
      introKey={`${presetId}-${depth}-${branching}-${plies}`}
      stats={
        <Stats>
          <Stat label="Depth searched" value={depth} color="var(--info)" sub={`of ${FULL_DEPTH} plies to the end of the game`} />
          <Stat label="Move chosen" value={chosen.move ?? '-'} color={misjudged ? 'var(--bad)' : 'var(--ok)'} sub={`really ${OUTCOME(chosenValue)}; best is ${OUTCOME(bestPerfect)}`} />
          <Stat label="Nodes searched" value={chosen.nodes.toLocaleString('en-US')} color="var(--hi)" sub="alpha-beta, to this depth" />
          <Stat label={`${branching}^${plies}`} value={growth(branching, plies).toLocaleString('en-US')} color="var(--bad)" sub="positions a full-width search would face" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'move chosen at this depth', shape: 'square' },
            { color: 'var(--ok)', label: 'best move under perfect play', shape: 'square' },
            { color: 'var(--bad)', label: 'chosen move that loses ground', shape: 'square' },
            { color: 'var(--info)', label: 'X', shape: 'dot' },
            { color: 'var(--violet)', label: 'O', shape: 'dot' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {BOARD_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={presetId === p.id} onClick={() => setPresetId(p.id)}>{p.label}</ChipButton>
          ))}
          <Slider label="Search depth" value={depth} min={1} max={FULL_DEPTH} onChange={setDepth} />
        </>,
        <>
          <Segmented label="Branching b" value={branching} onChange={setBranching} options={BRANCHINGS.map((b) => ({ value: b, label: String(b) }))} />
          <Slider label="Depth d (plies)" value={plies} min={1} max={DEPTH_MAX} onChange={setPlies} />
        </>,
      ]}
    >
      <div className="gt-stage stage-pad gt-center">
        <CellGrid
          rows={3}
          cols={3}
          size={CELL}
          cell={(r, c) => {
            const i = r * 3 + c;
            const m = board[i];
            if (m !== '.') return { tone: m === 'X' ? 'info' : 'violet', fill: 'tint', text: m };
            const picked = chosen.move === i;
            const tone = picked ? (misjudged ? 'bad' : 'hi') : bestCells.includes(i) ? 'ok' : 'dim';
            return { tone, fill: picked ? 'solid' : 'outline', text: limitedOf(i) ?? '' };
          }}
          cellAriaLabel={(r, c) => {
            const i = r * 3 + c;
            return board[i] === '.' ? `Cell ${i}: score ${limitedOf(i)} at depth ${depth}${bestCells.includes(i) ? ', best under perfect play' : ''}` : `Cell ${i}: ${board[i]}`;
          }}
          ariaLabel={`Board with ${mark} to move; each empty cell shows its score at depth ${depth}`}
        />
        <p className="gt-note">
          Each empty cell shows the score of that move at depth {depth}: below the horizon the position is judged by the heuristic (open lines for the side to move minus open lines for the other side, {evaluate(board, mark)} here before moving), and a win is worth {WIN}. Raise the depth until the chosen move turns green. This is the horizon effect: a bad or good line that starts just beyond the cut-off is invisible.
        </p>
        <h4 className="gt-h">Why not just search deeper</h4>
        <p className="gt-note">
          A game with about {branching} moves in each position and {plies} plies to look through has about {branching}^{plies} = {growth(branching, plies).toLocaleString('en-US')} positions in its full-width tree. The figure 35 is from memory as a rough average for chess, where "30 or more" is the safe thing to say; the table is arithmetic, not data about any engine. Alpha-beta with good ordering roughly takes the square root of that, and still not enough, which is why engines stop at a depth and use a heuristic.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">every score is computed by searching the board shown to the depth chosen</Provenance>
        <Provenance kind="from-memory">35 as chess's branching factor is a rough figure from memory, not measured here</Provenance>
        <Provenance kind="toy">3x3 tic-tac-toe with a deliberately simple heuristic; real engines use large evaluation functions</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

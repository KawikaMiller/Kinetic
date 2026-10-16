import { useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { OPENING } from './presets';
import { EMPTY_BOARD, movesOf, other, play, resultOf, searchBoard, type Mark } from './ttt';

type First = 'you' | 'machine';

interface Cost {
  plain: number;
  fast: number;
  plies: number;
  move: number;
}

interface GameState {
  board: string;
  cost: Cost | null;
  note: string;
}

const fmt = (n: number) => n.toLocaleString('en-US');
const CELL = { cell: 74, font: 30 };

/** The machine's move for `mark`: both searches are run for the counters, the alpha-beta move is played. */
function machinePlays(board: string, mark: Mark): { board: string; cost: Cost } {
  const plain = searchBoard(board, mark, { prune: false });
  const fast = searchBoard(board, mark, { prune: true });
  return { board: play(board, fast.move!, mark), cost: { plain: plain.nodes, fast: fast.nodes, plies: movesOf(board).length, move: fast.move! } };
}

const opening = (first: First): GameState => {
  if (first === 'you') return { board: EMPTY_BOARD, cost: null, note: 'Your move: you are X.' };
  const m = machinePlays(EMPTY_BOARD, 'X');
  return { board: m.board, cost: m.cost, note: `The machine opened at cell ${m.cost.move}. Your move: you are O.` };
};

/** Scene 3, tic-tac-toe: play the machine, and see what each of its moves cost with plain minimax and with alpha-beta. */
export function GameScene({ picker }: { picker: ReactNode }) {
  const [first, setFirst] = useState<First>(OPENING.game.first);
  const [game, setGame] = useState<GameState>(() => opening(OPENING.game.first));
  const mine: Mark = first === 'you' ? 'X' : 'O';
  const theirs = other(mine);
  const { board, cost } = game;
  const result = resultOf(board);

  const restart = (next: First) => {
    setFirst(next);
    setGame(opening(next));
  };
  const click = (cell: number) => {
    if (result !== null) return;
    if (board[cell] !== '.') {
      setGame({ ...game, note: `Cell ${cell} is taken: pick an empty one.` });
      return;
    }
    const after = play(board, cell, mine);
    if (resultOf(after) !== null) {
      setGame({ board: after, cost, note: 'You moved.' });
      return;
    }
    const m = machinePlays(after, theirs);
    setGame({ board: m.board, cost: m.cost, note: `The machine played cell ${m.cost.move}.` });
  };

  const saved = cost ? 1 - cost.fast / cost.plain : 0;
  const verdict = result === null ? 'in play' : result === 'draw' ? 'a draw' : result === mine ? 'you win' : 'the machine wins';

  return (
    <StageFrame
      height={470}
      intro={
        cost
          ? <>The machine's last move looked {cost.plies} plies ahead to the end of the game: plain minimax visited {fmt(cost.plain)} positions, alpha-beta {fmt(cost.fast)}, {(saved * 100).toFixed(1)}% fewer, and both chose cell {cost.move}.</>
          : <>You move first, as X. Each reply the machine makes is found by searching the whole game tree below the position, and the counters show what that costs.</>
      }
      introKey={`${board}-${cost?.plain ?? 0}-${cost?.fast ?? 0}`}
      stats={
        <Stats>
          <Stat label="Plain minimax" value={cost ? fmt(cost.plain) : '-'} color="var(--bad)" sub={cost ? `positions visited, ${cost.plies} plies deep` : 'after the machine moves'} />
          <Stat label="Alpha-beta" value={cost ? fmt(cost.fast) : '-'} color="var(--ok)" sub={cost ? `${(saved * 100).toFixed(1)}% fewer, same move` : 'after the machine moves'} />
          <Stat label="Game" value={verdict} color={result === null ? 'var(--hi)' : result === 'draw' ? 'var(--info)' : result === mine ? 'var(--ok)' : 'var(--bad)'} sub={result === null ? `${movesOf(board).length} empty cells` : 'finished'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'X', shape: 'square' },
            { color: 'var(--violet)', label: 'O', shape: 'square' },
            { color: 'var(--hi)', label: "the machine's last move", shape: 'square' },
            { color: 'var(--bad)', label: 'plain minimax count (the costly side)', shape: 'dot' },
            { color: 'var(--ok)', label: 'alpha-beta count', shape: 'dot' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Who moves first" value={first} onChange={restart} options={[{ value: 'you' as First, label: 'You (X)' }, { value: 'machine' as First, label: 'The machine (X)' }]} />
          <Button onClick={() => restart(first)}>New game</Button>
          <Hint><span role="status">{game.note}</span></Hint>
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
            const mark = board[i];
            const lastMachine = cost !== null && cost.move === i;
            const tone = mark === 'X' ? 'info' : mark === 'O' ? 'violet' : undefined;
            return mark === '.' ? { tone: 'dim', fill: 'outline', text: '' } : { tone: lastMachine ? 'hi' : tone, fill: 'tint', text: mark };
          }}
          onCellClick={(r, c) => click(r * 3 + c)}
          cellAriaLabel={(r, c) => `Cell ${r * 3 + c}: ${board[r * 3 + c] === '.' ? 'empty' : board[r * 3 + c] + ', taken'}`}
          ariaLabel="Tic-tac-toe board"
        />
        <p className="gt-note">
          With perfect play by both sides this game is a draw, and the machine, searching to the end every time, never loses (a test plays every opponent strategy against it). Plain minimax from the empty board visits every node of the game tree; the count is computed by running it, not typed in. Alpha-beta gives the same move on fewer positions.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the searches run in your browser on the board you see; the node counts are counted, not typed</Provenance>
        <Provenance kind="toy">3x3 tic-tac-toe; a real engine for a bigger game searches far fewer plies and guesses the rest</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

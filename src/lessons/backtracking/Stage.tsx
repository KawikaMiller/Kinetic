import { useMemo, useState } from 'react';
import { CallStackPanel, type CallFrame } from '../../components/CallStackPanel';
import { CellGrid, type GridCellSpec, type GridHighlight } from '../../components/CellGrid';
import { Box, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeNodeMark, type TreeShape } from '../../components/TreeSvg';
import { Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { superscript } from '../../core/format';
import { choose } from '../../core/stats';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { colName, queensFrames, rowName, STEP_CAP, subsetFrames, type BtFrame, type Run } from './frames';
import { attackedSquares, fullBoards, MAX_DRAWN_N, MAX_N, MIN_N, SUBSET_ITEMS, unprunedVisits, type SearchNode } from './model';
import './styles.css';

type Puzzle = 'queens' | 'subsets';

const QUEENS_STEP_MS = 650;
const SUBSETS_STEP_MS = 850;
/** The tree keeps this width on a phone and scrolls sideways (rollout spec). */
const TREE_MIN_W = 600;
const TREE_PAD = 52;
const TREE_TOP = 22;
const TREE_BOTTOM = 30;
/** The smallest text in the tree: row and leaf labels (.bt-level, .bt-leaf). */
const TREE_TEXT_PX = 11;
const LEVEL_GAP = { queens: 40, subsets: 46 } as const;
const LEAF_W = { queens: 16, subsets: 36 } as const;
const NODE_R = { queens: 5.5, subsets: 9 } as const;
const STACK_MIN_H = 150;
const QUEEN = '♛';
const N_OPTIONS = Array.from({ length: MAX_N - MIN_N + 1 }, (_, i) => ({ value: MIN_N + i, label: String(MIN_N + i) }));
const fmt = (v: number | bigint) => v.toLocaleString('en-US');

export function Stage() {
  const [puzzle, setPuzzle] = useState<Puzzle>('queens');
  const [n, setN] = useState(4);
  const [prune, setPrune] = useState(true);

  const run = useMemo(() => (puzzle === 'queens' ? queensFrames(n, prune) : subsetFrames()), [puzzle, n, prune]);
  const player = usePlayer(run.frames, { interval: puzzle === 'queens' ? QUEENS_STEP_MS : SUBSETS_STEP_MS });
  const f = player.frame;
  const queens = puzzle === 'queens';

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label={queens ? 'Placements tried' : 'Decisions'} value={fmt(f.visited)} color="var(--hi)" sub={queens ? 'nodes visited' : 'include or skip'} />
          <Stat label={queens ? 'Solutions' : 'Subsets out'} value={f.solutions} color="var(--ok)" />
          {queens ? (
            <Stat label="Without pruning" value={fmt(unprunedVisits(n))} color="var(--bad)" sub={`placements; ${n}${superscript(n)} = ${fmt(fullBoards(n))} full boards`} />
          ) : (
            <Stat label="Brute force" value={2 ** SUBSET_ITEMS.length} color="var(--muted)" sub={`2${superscript(SUBSET_ITEMS.length)} subsets: the same`} />
          )}
        </Stats>
      }
      legend={
        <Legend
          items={
            queens
              ? [
                  { color: 'var(--hi)', label: 'trying now' },
                  { color: 'var(--info)', label: 'placed queen' },
                  { color: 'color-mix(in srgb, var(--bad) 30%, transparent)', label: 'attacked square' },
                  { color: 'var(--ok)', label: 'solution' },
                  { color: 'var(--bad)', label: 'dead branch', shape: 'dot' },
                  { color: 'var(--dim)', label: 'not tried yet', shape: 'dot' },
                ]
              : [
                  { color: 'var(--hi)', label: 'deciding now' },
                  { color: 'var(--info)', label: 'included' },
                  { color: 'var(--dim)', label: 'skipped / not tried yet' },
                  { color: 'var(--ok)', label: 'subset output' },
                ]
          }
        />
      }
      controls={[
        <>
          <Segmented
            label="Puzzle"
            value={puzzle}
            onChange={setPuzzle}
            options={[
              { value: 'queens', label: 'N-Queens' },
              { value: 'subsets', label: 'Subsets of {a, b, c, d}' },
            ]}
          />
        </>,
        queens ? (
          <>
            <Segmented label="n" value={n} onChange={setN} options={N_OPTIONS} />
            <Toggle label="Check queens" value={prune} onChange={setPrune} off="Only full boards" on="As you place (prune)" />
          </>
        ) : (
          <Hint key="subsets">No options here: every subset is an answer, so there is nothing to prune.</Hint>
        ),
      ]}
    >
      <div className="bt stage-pad">
        <div className="bt-left">
          {queens ? <QueensBoard n={n} f={f} /> : <SubsetItems f={f} nodes={run.nodes} />}
          <CallStackPanel
            frames={stackFrames(f, run.nodes, queens, n)}
            meta={queens ? 'a frame per queen' : 'a frame per choice'}
            minHeight={STACK_MIN_H}
            empty={<p className="empty-note">{f.returned ? 'empty: the search has returned' : 'empty'}</p>}
          />
        </div>
        <div className="bt-right">
          {run.drawn > 0 ? (
            <SearchTree run={run} f={f} puzzle={puzzle} n={n} />
          ) : (
            <Box className="bt-note">
              <p>
                The search tree is drawn for n ≤ {MAX_DRAWN_N}; for {MAX_DRAWN_N + 1} and {MAX_N} only the counters run. This run tries {fmt(run.total)} placements
                {prune ? ' even with pruning' : ''}, far too many nodes to draw.
              </p>
              {!prune && <Hint block>Unpruned counts at this size come from a formula (each full board's place in the search order) that the tests check against real runs, not from running every step here.</Hint>}
            </Box>
          )}
        </div>
      </div>
    </StageFrame>
  );
}

function QueensBoard({ n, f }: { n: number; f: BtFrame }) {
  // Squares attacked by the queens already standing, not by the one being tried.
  const standing = f.tried ? f.board.slice(0, -1) : f.board;
  const attacked = attackedSquares(standing, n);
  const solved = f.outcome === 'solution';
  const cell = (r: number, c: number): GridCellSpec => {
    if (f.tried && f.tried.r === r && f.tried.c === c) return { text: QUEEN, tone: solved ? 'ok' : 'hi', fill: 'solid' };
    if (f.board[r] === c) return { text: QUEEN, tone: solved ? 'ok' : 'info', fill: 'solid' };
    if (attacked.has(`${r},${c}`)) return { tone: 'bad', fill: 'tint', intensity: 0.28 };
    return {};
  };
  const rings: GridHighlight[] = [
    ...[...new Set(f.conflicts.flat())].map((r) => ({ r, c: f.board[r], tone: 'bad' as const })),
    ...(f.lifted ? [{ r: f.lifted.r, c: f.lifted.c, tone: 'hi' as const }] : []),
  ];
  const label = (r: number, c: number) => {
    const s = cell(r, c);
    const what = s.text ? (s.tone === 'hi' ? 'trying a queen' : 'queen') : s.tone === 'bad' ? 'attacked' : 'empty';
    return `${rowName(r)}, ${colName(c)}: ${what}`;
  };
  return (
    <div className="bt-board">
      <CellGrid
        rows={n}
        cols={n}
        size="md"
        cell={cell}
        highlight={rings}
        rowLabels={Array.from({ length: n }, (_, i) => i + 1)}
        colLabels={Array.from({ length: n }, (_, i) => i + 1)}
        cellTitle={label}
        ariaLabel={`${n} by ${n} board, ${f.board.length} queens placed`}
        className="bt-grid"
      />
      <Hint block>
        Without even the one-per-row rule there are C({n * n}, {n}) = {fmt(choose(n * n, n))} ways to put {n} queens on {n * n} squares.
      </Hint>
    </div>
  );
}

function SubsetItems({ f, nodes }: { f: BtFrame; nodes: readonly SearchNode[] }) {
  const decided = f.cur !== null ? nodes[f.cur].depth + 1 : f.returned ? SUBSET_ITEMS.length : 0;
  const cell = (_: number, c: number): GridCellSpec => {
    const item = SUBSET_ITEMS[c];
    if (f.chosen.includes(item)) return { text: item, tone: 'info', fill: 'solid' };
    if (c === f.deciding) return { text: item, tone: 'hi', fill: 'outline' };
    if (c < decided) return { text: item, tone: 'dim', fill: 'tint' };
    return { text: item };
  };
  return (
    <div className="bt-items">
      <CellGrid rows={1} cols={SUBSET_ITEMS.length} size="md" cell={cell} ariaLabel={`Items: ${f.chosen.length ? f.chosen.join(', ') : 'none'} included so far`} />
      <Tray label={`Output (${f.found.length})`} labelWeight="regular" ariaLabel="Subsets output">
        {f.found.map((s) => (
          <span key={s.join('') || 'empty'} className="chip tone-ok bt-subset">
            {s.length ? `{${s.join(', ')}}` : '{ }'}
          </span>
        ))}
      </Tray>
    </div>
  );
}

/** The call stack, top first: one frame per row with a queen (queens) or per decision (subsets). */
function stackFrames(f: BtFrame, nodes: readonly SearchNode[], queens: boolean, n: number): CallFrame[] {
  if (f.returned) return [];
  const solved = f.outcome === 'solution' || (f.cur !== null && f.status[f.cur] === 'solution');
  const topState = f.outcome === 'dead' ? 'error' : solved ? 'ok' : 'running';
  const rows: CallFrame[] = queens
    ? [
        { id: 'root', name: `solve(n = ${n})` },
        ...f.board.map((c, r) => ({ id: `r${r}`, name: `place(${rowName(r)})`, detail: colName(c) })),
      ]
    : [
        { id: 'root', name: `subsets({${SUBSET_ITEMS.join(', ')}})` },
        ...(f.cur === null ? [] : pathOf(nodes, f.cur)).map((node) => ({
          id: `d${node.depth}`,
          name: `choose(${SUBSET_ITEMS[node.depth]})`,
          detail: node.choice === 1 ? 'include' : 'skip',
        })),
      ];
  return rows.reverse().map((row, i) => ({ ...row, state: i > 0 ? 'waiting' : topState }));
}

function pathOf(nodes: readonly SearchNode[], id: number): SearchNode[] {
  const out: SearchNode[] = [];
  for (let x: number | null = id; x !== null && x !== 0; x = nodes[x].parent) out.unshift(nodes[x]);
  return out;
}

function SearchTree({ run, f, puzzle, n }: { run: Run; f: BtFrame; puzzle: Puzzle; n: number }) {
  const { nodes, drawn } = run;
  const kids = useMemo(() => {
    const out = Array.from({ length: drawn }, (): number[] => []);
    for (let id = 1; id < drawn; id++) out[nodes[id].parent!].push(id);
    return out;
  }, [nodes, drawn]);
  const leaves = kids.filter((k) => k.length === 0).length;
  const depth = puzzle === 'queens' ? n : SUBSET_ITEMS.length;
  const width = Math.max(TREE_MIN_W, leaves * LEAF_W[puzzle] + 2 * TREE_PAD);
  const height = TREE_TOP + depth * LEVEL_GAP[puzzle] + TREE_BOTTOM;
  const shape: TreeShape<number> = { root: 0, children: (id) => kids[id] ?? [] };
  const status = f.status;
  const tried = status.filter((s) => s !== 'hidden' && s !== 'untried').length - 1;
  const outside = f.cur === null && f.outcome !== null;

  const mark = (id: number): TreeNodeMark | null => {
    const s = status[id];
    if (s === 'dead') return { tone: 'bad', fill: 'solid' };
    if (s === 'solution') return { tone: 'ok', fill: 'solid' };
    if (id === f.cur) return { tone: 'hi', fill: 'solid' };
    if (s === 'path') return { tone: 'info', fill: 'tint', tint: 35 };
    if (s === 'untried') return { tone: 'dim', fill: 'tint' };
    return null;
  };
  const leafText = (id: number) => {
    if (puzzle !== 'subsets' || kids[id].length || status[id] !== 'solution') return null;
    return pathOf(nodes, id).flatMap((x) => (x.choice === 1 ? [SUBSET_ITEMS[x.depth]] : [])).join('') || '∅';
  };

  return (
    <div className="bt-tree-wrap">
      <WideRegion minWidth={minWidthForText(width, TREE_TEXT_PX, TREE_MIN_W)} label="Search tree: scroll sideways to see all of it">
        <TreeSvg
          shape={shape}
          layout="tidy"
          width={width}
          height={height}
          pad={TREE_PAD}
          top={TREE_TOP}
          levelGap={LEVEL_GAP[puzzle]}
          className="bt-tree"
          ariaLabel={`Search tree: ${tried} of ${drawn - 1} drawn nodes tried so far`}
          hidden={(id) => status[id] === 'hidden'}
          nodeMark={mark}
          nodeClass={(id) => (id === f.cur ? 'bt-cur' : '')}
          edgeMark={(_, c) => (status[c] === 'dead' ? { tone: 'bad', dashed: true } : status[c] === 'path' ? { tone: 'info' } : null)}
          markedEdgeWidth={2.5}
          renderNode={(id) => (
            <>
              <circle r={NODE_R[puzzle]} />
              {leafText(id) !== null && (
                <text y={NODE_R[puzzle] + 13} textAnchor="middle" className="bt-leaf">
                  {leafText(id)}
                </text>
              )}
            </>
          )}
          overlay={({ levelGap }) =>
            Array.from({ length: depth }, (_, d) => (
              <text key={d} x={6} y={TREE_TOP + (d + 1) * levelGap + 4} className="bt-level">
                {puzzle === 'queens' ? rowName(d) : SUBSET_ITEMS[d]}
              </text>
            ))
          }
        />
      </WideRegion>
      <Hint block>
        {puzzle === 'subsets'
          ? 'Left branch = include the item, right branch = skip it. Each leaf is one subset.'
          : nodes.length > drawn
            ? `Tree cap: only the first ${drawn - 1} of the ${fmt(nodes.length - 1)} placements this search makes are drawn; the rest run in the counters.`
            : `The whole search tree: all ${drawn - 1} placements tried.`}
        {run.capped && ` Steps: the first ${STEP_CAP} are shown, then the run fast-forwards to its real end state.`}
        {outside && ' The step now is outside the drawn part of the tree.'}
      </Hint>
    </div>
  );
}

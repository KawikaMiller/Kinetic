import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { power } from '../../core/format';
import { factorial } from '../../core/stats';
import { usePlayer } from '../../core/usePlayer';
import { countsCaption, group, growthCaption, pascalCaption, treeFrames } from './frames';
import {
  GROWTHS, LEAF_CAP, MAX_N, MIN_N, PASCAL_ROWS, choiceChildren, counts, deepestShown, groups, letters, pascal, permutations,
  scientific, type Growth,
} from './model';
import './styles.css';

type Scene = 'tree' | 'pascal' | 'explosion';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'tree', label: 'Choice tree' },
  { value: 'pascal', label: 'Pascal' },
  { value: 'explosion', label: 'Explosion' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Tool', options: SCENES, initial: 'tree' });
  if (scene === 'pascal') return <PascalScene picker={picker} />;
  if (scene === 'explosion') return <ExplosionScene picker={picker} />;
  return <TreeScene picker={picker} />;
}

// ── Choice tree ──────────────────────────────────────────────────────

const STEP_MS = 1100;
const N_OPTIONS = Array.from({ length: MAX_N - MIN_N + 1 }, (_, i) => ({ value: MIN_N + i, label: String(MIN_N + i) }));
const TREE_HEIGHT = 250;
/** Levels with more nodes than this draw dots instead of lettered circles. */
const LETTERED_MAX = 30;
/** Orderings are listed in a group while there are at most this many. */
const ORDERS_LISTED = 6;

/** Horizontal room per leaf column, by how many leaves there are. */
const leafSpacing = (leaves: number) => (leaves > 40 ? 6.5 : leaves > 12 ? 18 : 44);

function TreeScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(4);
  const [k, setK] = useState(2);
  const [ordered, setOrdered] = useState(true);
  const frames = useMemo(() => treeFrames(n, k, ordered), [n, k, ordered]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { depth, expanding, leaves, merged } = player.frame;
  const shown = deepestShown(n, k);
  const columns = Number(permutations(n, shown));
  const width = Math.max(340, columns * leafSpacing(columns) + 80);
  const c = counts(n, k);

  const changeN = (next: number) => {
    setN(next);
    setK(Math.min(k, next));
  };
  const levelSize = (d: number) => Number(permutations(n, d));

  return (
    <StageFrame
      player={player}
      height={340}
      stats={
        <Stats>
          <Stat label="Ordered picks P(n, k)" value={group(c.ordered)} color="var(--info)" />
          <Stat label="Orderings of one group" value={group(factorial(k))} sub={`${k}!`} />
          <Stat label="Combinations C(n, k)" value={group(c.unordered)} color="var(--violet)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'branches being expanded', shape: 'dot' },
            { color: 'var(--info)', label: 'finished picks (leaves)', shape: 'dot' },
            { color: 'var(--violet)', label: 'leaves merged into one combination', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Tiles n" value={n} onChange={changeN} options={N_OPTIONS} />
          <Segmented
            label="Pick k"
            value={k}
            onChange={setK}
            options={Array.from({ length: n }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
          />
          <Toggle label="Order matters" value={ordered} onChange={setOrdered} off="No" on="Yes" />
        </>,
      ]}
    >
      <div className="stage-pad cb-tree">
        <div className="cb-tiles" aria-label={`${n} tiles`}>
          {letters(n).map((l) => <span key={l} className="cb-tile">{l}</span>)}
        </div>
        <WideRegion minWidth={width} hint="swipe to see the whole tree">
          <div className="cb-tree-box" style={{ width }}>
            <TreeSvg<string>
              shape={{ root: '', children: (id) => (id.length >= shown ? [] : choiceChildren(n, k, id)) }}
              width={width}
              height={TREE_HEIGHT}
              top={22}
              bottomRoom={40}
              hidden={(id) => id.length > depth}
              renderNode={(id) => {
                const lettered = levelSize(id.length) <= LETTERED_MAX;
                return id === ''
                  ? <circle r={6} className="cb-root" />
                  : (
                    <>
                      <circle r={lettered ? 10 : 3} className="cb-dot" />
                      {lettered && <text y={4} textAnchor="middle" className="cb-letter">{id.at(-1)}</text>}
                    </>
                  );
              }}
              nodeClass={(id) => {
                if (id.length === expanding) return 'cb-now';
                if (id.length === k && merged) return 'cb-merge';
                if (id.length === k && leaves) return 'cb-leaf';
                return '';
              }}
              ariaLabel={`Choice tree for ${k} of ${n} tiles, ${depth} levels drawn`}
            />
          </div>
        </WideRegion>
        {shown < k && (
          <Hint className="cb-note">
            More than {LEAF_CAP} leaves ({group(c.ordered)}): the tree stops at pick {shown}; each dot on the last row stands for{' '}
            {group(permutations(n - shown, k - shown))} leaves below it.
          </Hint>
        )}
        {merged && <Groups n={n} k={k} />}
      </div>
    </StageFrame>
  );
}

function Groups({ n, k }: { n: number; k: number }) {
  const all = groups(n, k);
  return (
    <div className="cb-groups" aria-label={`${all.length} combinations`}>
      {all.map(({ set, orders }) => (
        <span key={set} className="cb-group" title={orders.length <= 120 ? orders.join(' ') : undefined}>
          <b>{set}</b>
          <i>{orders.length <= ORDERS_LISTED ? orders.join(' · ') : `${group(orders.length)} orders`}</i>
        </span>
      ))}
    </div>
  );
}

// ── Pascal ───────────────────────────────────────────────────────────

const ROWS = pascal(PASCAL_ROWS);

function PascalScene({ picker }: { picker: ReactNode }) {
  const [sel, setSel] = useState({ r: 6, c: 3 });
  const [repeat, setRepeat] = useState(false);
  const setCaption = useSetCaption();
  const { r: n, c: k } = sel;
  const target = repeat ? { r: n + k - 1, c: k } : sel;
  const onTriangle = target.r >= 0 && target.r < PASCAL_ROWS;
  const c = counts(n, k);

  useIntroCaption(<>Pascal's triangle: row r lists C(r, 0) … C(r, r), and every cell is the sum of the two above it. Click a cell.</>);

  const pick = (r: number, col: number) => {
    if (col > r) {
      setCaption(<>Row {r} only goes up to C({r}, {r}): you can't choose more than you have.</>);
      return;
    }
    setSel({ r, c: col });
    setCaption(repeat ? countsCaption(r, col, true, r + col - 1 >= 0 && r + col - 1 < PASCAL_ROWS) : pascalCaption(ROWS, r, col));
  };
  const flip = (on: boolean) => {
    setRepeat(on);
    setCaption(countsCaption(n, k, on, !on || (n + k - 1 >= 0 && n + k - 1 < PASCAL_ROWS)));
  };

  const parents = onTriangle && target.c > 0 && target.c < target.r ? [[target.r - 1, target.c - 1], [target.r - 1, target.c]] : [];
  const cell = (r: number, col: number): GridCellSpec => {
    if (col > r) return { fill: 'none' };
    if (onTriangle && r === target.r && col === target.c) return { tone: 'hi', fill: 'solid', text: ROWS[r][col] };
    if (parents.some(([pr, pc]) => pr === r && pc === col)) return { tone: 'info', fill: 'solid', text: ROWS[r][col] };
    return { tone: 'violet', fill: 'tint', intensity: 0.12, text: ROWS[r][col] };
  };

  return (
    <StageFrame
      height={320}
      stats={
        <Stats>
          <Stat label="n, k" value={`${n}, ${k}`} />
          <Stat label={repeat ? 'In order, repeats' : 'In order'} value={group(repeat ? c.orderedRepeat : c.ordered)} sub={repeat ? power(k, n) : `P(${n}, ${k})`} />
          <Stat label={repeat ? 'Any order, repeats' : 'Any order'} value={group(repeat ? c.unorderedRepeat : c.unordered)} color="var(--hi)" sub={repeat ? `C(${n + k - 1}, ${k})` : `C(${n}, ${k})`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the matching cell' },
            { color: 'var(--info)', label: 'the two cells above it, summed' },
            { color: 'color-mix(in srgb, var(--violet) 30%, transparent)', label: 'the rest of the triangle' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Repeats allowed" value={repeat} onChange={flip} off="No" on="Yes" />
        </>,
      ]}
    >
      <div className="stage-pad cb-pascal">
        <CellGrid
          rows={PASCAL_ROWS}
          cols={PASCAL_ROWS}
          size="sm"
          rowLabels={ROWS.map((_, r) => `n=${r}`)}
          cell={cell}
          onCellClick={pick}
          cellTitle={(r, col) => (col > r ? '' : `C(${r}, ${col}) = ${ROWS[r][col]}`)}
          cellAriaLabel={(r, col) => (col > r ? `row ${r}, empty` : `C(${r}, ${col}) = ${ROWS[r][col]}`)}
          ariaLabel="Pascal's triangle, rows 0 to 10"
        />
        <table className="data-table cb-counts">
          <thead>
            <tr><th>{k} from {n}</th><th className={repeat ? '' : 'is-on'}>no repeats</th><th className={repeat ? 'is-on' : ''}>repeats allowed</th></tr>
          </thead>
          <tbody>
            <tr><th>order matters</th><td className={repeat ? '' : 'is-on'}>{group(c.ordered)}</td><td className={repeat ? 'is-on' : ''}>{group(c.orderedRepeat)}</td></tr>
            <tr><th>any order</th><td className={repeat ? '' : 'is-on'}>{group(c.unordered)}</td><td className={repeat ? 'is-on' : ''}>{group(c.unorderedRepeat)}</td></tr>
          </tbody>
        </table>
        {!onTriangle && (
          <Hint className="cb-note">
            {target.r < 0
              ? 'With n = 0 there is nothing to pick from: only the empty pick, 1 way, and no cell for it.'
              : `C(${target.r}, ${target.c}) is below row ${PASCAL_ROWS - 1}, off this triangle.`}
          </Hint>
        )}
      </div>
    </StageFrame>
  );
}

// ── Explosion ────────────────────────────────────────────────────────

function ExplosionScene({ picker }: { picker: ReactNode }) {
  const [ns, setNs] = useState<Record<Growth['id'], number>>(
    () => Object.fromEntries(GROWTHS.map((g) => [g.id, g.initial])) as Record<Growth['id'], number>,
  );
  const setCaption = useSetCaption();

  useIntroCaption(<>Counts multiply, so they explode: add one more flag, character or service and the total is multiplied, not
    increased. Drag a slider.</>);

  const change = (g: Growth, n: number) => {
    setNs((s) => ({ ...s, [g.id]: n }));
    setCaption(growthCaption(g, n));
  };

  return (
    <StageFrame height={300} controls={[<>{picker}</>]}>
      <div className="stage-pad cb-explode">
        {GROWTHS.map((g) => {
          const n = ns[g.id];
          const v = g.count(n);
          const sci = scientific(v);
          return (
            <Box key={g.id} className="cb-card">
              <SectionTitle hint={g.formula(n)}>{g.title}</SectionTitle>
              <Slider label={g.unit} value={n} min={g.min} max={g.max} onChange={(x) => change(g, x)} />
              <p className="cb-exact">{group(v)}</p>
              {sci.exponent >= 4 && <p className="cb-approx">≈ {sci.mantissa} × {power(sci.exponent, 10)}</p>}
            </Box>
          );
        })}
        <Hint className="cb-note">Every number is exact (computed with BigInt); the ≈ line is rounded to two digits.</Hint>
      </div>
    </StageFrame>
  );
}

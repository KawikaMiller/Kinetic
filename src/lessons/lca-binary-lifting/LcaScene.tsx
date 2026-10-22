import { useMemo, useState, type ReactNode } from 'react';
import type { TreeNodeMark } from '../../components/TreeSvg';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import {
  SHORT_TABLE_WITNESS, brokenReport, decide, landing, lcaWithMode, liftJump, naiveLca, shortFailsOnPaths, shortestWitness, startLca, type LcaGame, type TableMode,
} from './model';
import { TreeControls } from './TreeControls';
import { TreeView } from './TreeView';
import { useTree } from './useTree';

const DEFAULT_A = 10;
const DEFAULT_B = 8;
const MODES: { value: TableMode; label: string }[] = [
  { value: 'full', label: 'Full table' },
  { value: 'short', label: 'One level short (broken)' },
  { value: 'noEqualise', label: 'No depth equalising (broken)' },
];
const PATH_CHECK_NODES = 16;
const BIG_TREE_NODES = 8;
const NO_EQUALISE_WITNESS = shortestWitness('noEqualise')!;
const NO_EQUALISE_RUN = lcaWithMode(NO_EQUALISE_WITNESS.parents, NO_EQUALISE_WITNESS.query[0], NO_EQUALISE_WITNESS.query[1], 'noEqualise');
const NO_EQUALISE_TRUTH = naiveLca(NO_EQUALISE_WITNESS.parents, NO_EQUALISE_WITNESS.query[0], NO_EQUALISE_WITNESS.query[1]).answer;
const percent = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;

/** Scene 3: lift the deeper node, then jump or skip from the top level down; the answer is the parent of the nodes left. */
export function LcaScene({ picker }: { picker: ReactNode }) {
  const tree = useTree();
  const { parents, table } = tree;
  const n = parents.length;
  const [pickedA, setA] = useState(DEFAULT_A);
  const [pickedB, setB] = useState(DEFAULT_B);
  const [sets, setSets] = useState<'A' | 'B'>('A');
  const [mode, setMode] = useState<TableMode>('full');
  const a = pickedA < n ? pickedA : 0;
  const b = pickedB < n ? pickedB : 0;
  const key = `${parents.join()}|${a}|${b}`;
  const [played, setPlayed] = useState<{ key: string; game: LcaGame; refusal: string | null } | null>(null);
  const game = played?.key === key ? played.game : startLca(table, a, b);
  const refusal = played?.key === key ? played.refusal : null;
  const naive = naiveLca(parents, a, b);
  const levelList = Array.from({ length: table.levels }, (_, level) => level);

  const apply = (result: { game: LcaGame; refusal: string | null }) => setPlayed({ key, ...result });
  const [ua, ub] = game.phase === 'climb' ? landing(game) : [0, 0];

  const run = lcaWithMode(parents, a, b, mode);
  const report = useMemo(() => (mode === 'full' ? null : brokenReport(7)), [mode]);
  const bigReport = useMemo(() => (mode === 'short' ? brokenReport(BIG_TREE_NODES) : null), [mode]);
  const pathCheck = useMemo(() => (mode === 'short' ? shortFailsOnPaths(PATH_CHECK_NODES) : null), [mode]);
  const wrong = run.answer !== naive.answer;
  const diff = Math.abs(table.depth[a] - table.depth[b]);

  const prompt =
    game.phase === 'lift'
      ? `Node ${game.a} is ${game.remaining} ${game.remaining === 1 ? 'level' : 'levels'} deeper than node ${game.b}: lift it by jumps that add up to ${game.remaining}.`
      : game.phase === 'climb'
        ? `Level k = ${game.level}: a jump of 2^${game.level} = ${2 ** game.level} lands on node ${ua} and node ${ub}. Jump or skip?`
        : `The lowest common ancestor of ${a} and ${b} is node ${game.answer}, after ${game.jumps} ${game.jumps === 1 ? 'jump' : 'jumps'} against ${naive.steps} parent steps for the naive walk.`;

  const mark = (id: number): TreeNodeMark | null => {
    if (game.phase === 'done' && id === game.answer) return { tone: 'ok', fill: 'solid' };
    if (game.phase !== 'done' && id === game.a) return { tone: 'hi', fill: 'solid' };
    if (game.phase !== 'done' && id === game.b) return { tone: 'hi', fill: 'tint' };
    if (id === a) return { tone: 'info', fill: 'tint' };
    if (id === b) return { tone: 'violet', fill: 'tint' };
    return null;
  };
  const loadWitness = (witnessParents: readonly number[], query: readonly [number, number], witnessMode: TableMode) => {
    tree.load(witnessParents);
    setPlayed(null);
    setA(query[0]);
    setB(query[1]);
    setSets('A');
    setMode(witnessMode);
  };
  const pick = (id: number) => {
    setPlayed(null);
    if (sets === 'A') {
      setA(id);
      setSets('B');
    } else {
      setB(id);
      setSets('A');
    }
  };

  return (
    <StageFrame
      height={560}
      intro={<>{refusal ? `${refusal} ` : ''}{prompt}</>}
      introKey={`lca|${key}|${game.phase}|${game.level}|${game.remaining}|${game.jumps}|${refusal ?? ''}`}
      stats={
        <Stats>
          <Stat label="A and B" value={`${a} and ${b}`} color="var(--info)" sub={`depths ${table.depth[a]} and ${table.depth[b]}`} />
          <Stat label="Jumps taken" value={game.jumps} color="var(--hi)" sub="in both phases" />
          <Stat label="Naive walk" value={naive.steps} color="var(--bad)" sub="parent steps, one at a time" />
          <Stat label="Answer" value={game.answer ?? '?'} color="var(--ok)" sub={game.phase === 'done' ? 'the lowest common ancestor' : 'not found yet'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'node A, as chosen', shape: 'square' },
            { color: 'var(--violet)', label: 'node B, as chosen', shape: 'square' },
            { color: 'var(--hi)', label: 'the two nodes as lifted so far', shape: 'square' },
            { color: 'var(--ok)', label: 'the answer', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TreeControls tree={tree} note="Click two nodes: the first click sets A, the next sets B." />
          <Segmented label="Click sets" value={sets} onChange={setSets} options={[{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }]} />
        </>,
        <>
          <span className="lc-group" role="group" aria-label="Phase 1: lift the deeper node">
            <span className="lc-label">Phase 1, lift</span>
            {levelList.map((level) => (
              <Button key={level} softDisabled={game.phase !== 'lift'} onClick={() => apply(liftJump(game, level))} aria-label={`Lift by 2 to the power ${level}, ${2 ** level} levels`}>
                Lift 2^{level} = {2 ** level}
              </Button>
            ))}
          </span>
          <span className="lc-group" role="group" aria-label="Phase 2: jump or skip">
            <span className="lc-label">Phase 2{game.phase === 'climb' ? `, k = ${game.level}` : ''}</span>
            <Button variant="primary" softDisabled={game.phase !== 'climb'} onClick={() => apply(decide(game, 'jump'))}>Jump</Button>
            <Button softDisabled={game.phase !== 'climb'} onClick={() => apply(decide(game, 'skip'))}>Skip</Button>
          </span>
          <Button onClick={() => setPlayed(null)}>Start again</Button>
          <Hint tone={refusal ? 'bad' : 'faint'}><span role="status">{refusal ?? 'Lift the deeper node to the other one\'s depth, then decide each level from the top down.'}</span></Hint>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <TreeView parents={parents} nodeMark={mark} reveal={game.phase === 'done' ? [a, b, game.answer ?? a] : [game.a, game.b]} onNodeClick={pick} ariaLabel="The tree: click nodes to choose A and B" />
        <section className="lc-auto" aria-label="The whole algorithm run automatically">
          <div className="lc-auto-head">
            <b>The same query run automatically</b>
            <Segmented label="Table" value={mode} onChange={setMode} options={MODES} />
            <ChipButton tone="bad" onClick={() => loadWitness(SHORT_TABLE_WITNESS.parents, SHORT_TABLE_WITNESS.query, 'short')}>
              Load the short-table witness
            </ChipButton>
            <ChipButton tone="bad" onClick={() => loadWitness(NO_EQUALISE_WITNESS.parents, NO_EQUALISE_WITNESS.query, 'noEqualise')}>
              Load the no-equalising witness
            </ChipButton>
          </div>
          <p className="lc-note">
            Answer by lifting: node {run.answer}. Answer by the naive walk: node {naive.answer}. {wrong ? 'These differ: the broken table gives a wrong LCA here.' : 'They agree.'}
            {mode === 'short' && wrong && ` The depth difference ${diff} (binary ${diff.toString(2)}) needs a jump the short table does not have, so the nodes never reach one depth.`}
            {mode === 'noEqualise' && wrong && ' Without lifting the deeper node first, equal jumps land at different depths and the comparisons mean nothing.'}
          </p>
          {report && (
            <>
              <p className="lc-note">
                Witness for the short table: parents [{SHORT_TABLE_WITNESS.parents.join(', ')}], query ({SHORT_TABLE_WITNESS.query.join(', ')}). The depth difference 4 is 100 in binary and needs the 2^2 level that is missing.
                Over the {report.trees} seven-node trees it is wrong on {report.shortFails} ({percent(report.shortFails, report.trees)}); that small rate is a trap, not a sign that the top level barely matters:
                it fails exactly when a depth gap needs the top level and the root clamp cannot cover for it.
                {bigReport && pathCheck && ` At ${BIG_TREE_NODES} nodes it is wrong on ${bigReport.shortFails} of ${bigReport.trees.toLocaleString('en-US')} trees (${percent(bigReport.shortFails, bigReport.trees)}), and on ${pathCheck.fails} of the ${pathCheck.paths} paths of 2 to ${PATH_CHECK_NODES} nodes, where the clamp rescues it.`}
              </p>
              <p className="lc-note">
                Dropping the depth equalising is wrong on {report.noEqualiseFails} of {report.trees} ({percent(report.noEqualiseFails, report.trees)}), so for that variant the witness, not the rate, is the lesson.
                Its shortest witness has {NO_EQUALISE_WITNESS.parents.length} nodes: parents [{NO_EQUALISE_WITNESS.parents.join(', ')}], query ({NO_EQUALISE_WITNESS.query.join(', ')}); it answers node {NO_EQUALISE_RUN.answer} where the walk answers node {NO_EQUALISE_TRUTH}.
                The full table passes all {report.trees}. The by-hand game above always uses the full table.
              </p>
            </>
          )}
        </section>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: the walk and the lifting both run on the tree above and are compared</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

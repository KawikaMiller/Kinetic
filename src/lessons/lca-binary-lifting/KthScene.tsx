import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { kthJump, popcount, startKth, type KthGame } from './model';
import { TreeControls } from './TreeControls';
import { TreeView } from './TreeView';
import { useTree } from './useTree';

const DEFAULT_NODE = 10;
const DEFAULT_K = 5;

function parseK(text: string, depth: number, node: number): { ok: true; k: number } | { ok: false; error: string } {
  const typed = text.trim();
  if (!/^\d+$/.test(typed)) return { ok: false, error: 'Type k as a whole number, 0 or more.' };
  const k = Number(typed);
  if (k > depth) return { ok: false, error: `Node ${node} is only ${depth} ${depth === 1 ? 'level' : 'levels'} deep, so it has no ancestor ${k} steps up.` };
  return { ok: true, k };
}

/** Scene 2: the k-th ancestor by the binary digits of k: the learner presses the jumps, and a jump larger than what is left is refused. */
export function KthScene({ picker }: { picker: ReactNode }) {
  const tree = useTree();
  const { parents, table } = tree;
  const [picked, setNode] = useState(DEFAULT_NODE);
  const node = picked < parents.length ? picked : 0;
  const [kText, setKText] = useState(String(DEFAULT_K));
  const depth = table.depth[node];
  const parsed = parseK(kText, depth, node);
  const k = parsed.ok ? parsed.k : null;
  const key = `${parents.join()}|${node}|${k}`;
  const [played, setPlayed] = useState<{ key: string; game: KthGame; refusal: string | null } | null>(null);
  const game: KthGame | null = k === null ? null : played?.key === key ? played.game : startKth(table, node, k);
  const refusal = played?.key === key ? played.refusal : null;

  const jump = (level: number) => {
    if (!game) return;
    const result = kthJump(game, level);
    setPlayed({ key, game: result.game, refusal: result.refusal });
  };
  const bits = k === null ? '' : k.toString(2);
  const done = game !== null && game.remaining === 0;

  return (
    <StageFrame
      height={460}
      intro={
        game === null
          ? <>{parsed.ok ? '' : parsed.error}</>
          : <>{refusal ? `${refusal} ` : ''}{done ? `Reached node ${game.at}, the ${game.k}th ancestor of node ${game.start}, in ${game.jumps.length} ${game.jumps.length === 1 ? 'jump' : 'jumps'}; the binary digits of ${game.k} (${bits}) need ${popcount(game.k)}.` : `${game.remaining} ${game.remaining === 1 ? 'step' : 'steps'} still to climb from node ${game.at}: press a jump no larger than that.`}</>
      }
      introKey={`kth|${key}|${game?.jumps.length ?? -1}|${refusal ?? ''}`}
      stats={
        <Stats>
          <Stat label="Node" value={node} color="var(--info)" sub={`${depth} ${depth === 1 ? 'level' : 'levels'} deep: click a node to change it`} />
          <Stat label="k" value={k ?? '–'} color="var(--hi)" sub={k === null ? 'not a usable k' : `binary ${bits}`} />
          <Stat label="Now at" value={game?.at ?? '–'} color="var(--ok)" sub={game ? `${game.remaining} to go` : ''} />
          <Stat label="Jumps taken" value={game?.jumps.length ?? '–'} color="var(--violet)" sub={k === null ? '' : `the binary digits need ${popcount(k)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the starting node', shape: 'square' },
            { color: 'var(--hi)', label: 'where the jumps have taken you', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TreeControls tree={tree} note="Click a node in the tree to choose where to start." />
        </>,
        <>
          <TextField label="k (steps up)" value={kText} onChange={setKText} width={90} spellCheck={false} />
          {Array.from({ length: table.levels }, (_, level) => (
            <Button key={level} softDisabled={game === null} onClick={() => jump(level)} aria-label={`Jump 2 to the power ${level}, ${2 ** level} steps`}>
              Jump 2^{level} = {2 ** level}
            </Button>
          ))}
          <Button onClick={() => setPlayed(null)}>Start again</Button>
          <Hint tone={parsed.ok && !refusal ? 'faint' : 'bad'}>
            <span role="status">{!parsed.ok ? parsed.error : refusal ?? 'Take the binary digits of k from the largest jump down.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <TreeView
          parents={parents}
          nodeMark={(id) => (game && id === game.at ? { tone: 'hi', fill: 'solid' } : id === node ? { tone: 'info', fill: 'tint' } : null)}
          onNodeClick={(id) => {
            setNode(id);
            setPlayed(null);
          }}
          ariaLabel="The tree: click a node to start from it"
        />
        <ol className="lc-log" aria-label="Jumps taken">
          {game?.jumps.map((j, i) => (
            <li key={i}>
              jump 2^{j.level} = {2 ** j.level}: node {j.from} to node {j.to} (up[{j.level}][{j.from}] = {j.to})
            </li>
          ))}
          {game && game.jumps.length === 0 && <li className="lc-dim">no jumps yet</li>}
        </ol>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: each jump reads the table built from the tree above</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

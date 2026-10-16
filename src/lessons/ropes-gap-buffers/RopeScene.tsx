import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { plural } from '../../core/format';
import { MAX_TEXT, OPEN, checkInsert, parsePosition } from './editing';
import {
  LEAF_MAX, codePoints, depthBound, needsRebalance, ropeBuild, ropeConcat, ropeCreate, ropeDelete, ropeDepth, ropeIndex, ropeInsert, ropeLeaves, ropeRebalance, ropeReachable, ropeTouches, type Rope,
} from './structures';

const LEAF_COLUMN_PX = 80;
const LEVEL_PX = 58;
const CHAR_PX = 7;
const MIN_LEAF_BOX = 26;

const startRope = (): Rope => {
  const r = ropeCreate();
  r.root = ropeBuild(r, codePoints(OPEN.rope.text));
  return r;
};


interface Last {
  what: string;
  created: Set<number>;
  shared: number;
  reads: number;
  rebuilt: boolean;
  path: number[];
}

const length = (r: Rope) => (r.root === null ? 0 : r.nodes[r.root].len);

/** Scene 3: the rope. Weights on internal nodes; edits build a few new nodes and share the rest. */
export function RopeScene({ picker }: { picker: ReactNode }) {
  const [rope, setRope] = useState<Rope>(startRope);
  const [iText, setIText] = useState(String(OPEN.rope.insertAt));
  const [jText, setJText] = useState('15');
  const [typed, setTyped] = useState<string>(OPEN.rope.insert);
  const [last, setLast] = useState<Last | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const n = length(rope);
  const leaves = ropeLeaves(rope).length;
  const depth = ropeDepth(rope);
  const bound = depthBound(leaves);

  /** Apply an edit to a copy (the node list is shared and only grows), then rebuild if the depth rule says so. */
  const edit = (what: (r: Rope) => void, describe: string) => {
    const next: Rope = { ...rope };
    const before = next.nodes.length;
    const reads0 = next.reads;
    what(next);
    let rebuilt = false;
    if (needsRebalance(next)) {
      ropeRebalance(next);
      rebuilt = true;
    }
    const live = ropeReachable(next);
    const created = new Set([...live].filter((id) => id >= before));
    setRope(next);
    setLast({ what: describe, created, shared: live.size - created.size, reads: next.reads - reads0, rebuilt, path: [] });
    setNote(null);
  };

  const insert = () => {
    const at = parsePosition(iText, n, 'index');
    if (!at.ok) return setNote(at.error);
    const items = checkInsert(n, typed);
    if (!items.ok) return setNote(items.error);
    edit((r) => ropeInsert(r, at.value, items.items), `Inserted ${plural(items.items.length, 'character')} at ${at.value}: split there, then concatenate three pieces`);
  };
  const remove = () => {
    const from = parsePosition(iText, n, 'index');
    if (!from.ok) return setNote(from.error);
    const to = parsePosition(jText, n, 'end');
    if (!to.ok) return setNote(to.error);
    if (to.value <= from.value) return setNote(`The range [${from.value}, ${to.value}) is empty or backwards: the end must come after the start (the end is not included).`);
    edit((r) => ropeDelete(r, from.value, to.value), `Deleted [${from.value}, ${to.value}): two splits and one concatenation`);
  };
  const append = () => {
    const items = checkInsert(n, typed);
    if (!items.ok) return setNote(items.error);
    edit((r) => {
      r.root = ropeConcat(r, r.root, ropeBuild(r, items.items));
    }, `Appended ${plural(items.items.length, 'character')}: a new root over the old rope and the new piece`);
  };
  const lookup = () => {
    if (n === 0) return setNote('The rope is empty: there is no character to look up.');
    const at = parsePosition(iText, n - 1, 'index');
    if (!at.ok) return setNote(at.error);
    const probe: Rope = { ...rope };
    const found = ropeIndex(probe, at.value);
    setLast({ what: `Index ${at.value} is ${JSON.stringify(found.char)}: walked down using the weights, ${plural(found.path.length, 'node')} read`, created: new Set(), shared: 0, reads: found.path.length, rebuilt: false, path: found.path });
    setNote(null);
  };
  const rebalance = () => {
    edit((r) => ropeRebalance(r), 'Rebuilt from the leaves: the leaves are shared, only the internal nodes are new');
  };
  const reset = () => {
    setRope(startRope());
    setLast(null);
    setNote(null);
  };

  const shape: TreeShape<number> = {
    root: rope.root,
    children: (id) => [rope.nodes[id].left, rope.nodes[id].right].filter((c): c is number => c !== null),
  };
  const width = Math.max(340, leaves * LEAF_COLUMN_PX);
  const edited = last !== null && last.path.length === 0 && last.shared > 0;
  const [baseTouches] = useState(() => ropeTouches(startRope()));
  const onPath = new Set(last?.path ?? []);

  const intro = last ? (
    <>
      {last.what}. {last.path.length === 0 ? <>{plural(last.created.size, 'new node')}, {plural(last.shared, 'node')} shared with the rope before.</> : null}
      {last.rebuilt ? ' The depth passed the bound, so the rope rebuilt itself from its leaves.' : ''} The rope is {n} characters in {plural(leaves, 'leaf', 'leaves')}, {depth} levels deep (bound {bound}).
    </>
  ) : (
    <>
      The text is a tree: leaves hold up to {LEAF_MAX} characters and each internal node stores the weight, the length of its left subtree. {n} characters, {plural(leaves, 'leaf', 'leaves')}, {depth} levels deep (the rebuild bound is {bound}).
    </>
  );

  return (
    <StageFrame
      height={460}
      intro={intro}
      introKey={[last, rope]}
      stats={
        <Stats>
          <Stat label="New nodes" value={last && last.path.length === 0 ? last.created.size : '–'} color="var(--hi)" sub={edited ? `${last?.shared} shared, not rebuilt` : 'after an edit'} />
          <Stat label="Nodes read" value={last ? last.reads : '–'} color="var(--info)" sub="walking down for the last action" />
          <Stat label="Depth" value={depth} sub={`rebuild above ${bound} (2 x ceil(log2 ${leaves}))`} />
          <Stat label="Touches so far" value={ropeTouches(rope) - baseTouches} sub="nodes read or created, characters copied" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'new nodes from the last edit', shape: 'square' },
            { color: 'var(--violet)', label: 'shared, unchanged', shape: 'square' },
            { color: 'var(--info)', label: 'path of an index lookup', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Index i" value={iText} onChange={setIText} onEnter={insert} width={64} spellCheck={false} />
          <TextField label="End j (delete [i, j))" value={jText} onChange={setJText} width={64} spellCheck={false} />
          <TextField label="Text" value={typed} onChange={setTyped} onEnter={insert} width={150} spellCheck={false} />
        </>,
        <>
          <Button variant="primary" onClick={insert}>Insert at i</Button>
          <Button onClick={remove}>Delete [i, j)</Button>
          <Button onClick={lookup}>Look up index i</Button>
          <Button onClick={append}>Append (concatenate)</Button>
          <Button onClick={rebalance}>Rebuild from leaves</Button>
          <Button onClick={reset}>Reset</Button>
          <Hint>
            <span role="status">{note ?? `Positions count code points. Up to ${MAX_TEXT} characters. The rebuild rule is simplified: rebuild when the depth passes twice the depth of a balanced tree over the leaves.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="rg-stage stage-pad">
        <WideRegion minWidth={width} label="The rope: scroll sideways to see all of it">
          <TreeSvg
            shape={shape}
            layout="tidy"
            width={width}
            height={depth * LEVEL_PX + 50}
            levelGap={LEVEL_PX}
            pad={LEAF_COLUMN_PX / 2}
            top={30}
            natural
            ariaLabel={`Rope over ${n} characters in ${leaves} leaves`}
            renderNode={(id) => {
              const node = rope.nodes[id];
              if (node.leaf) {
                const w = Math.max(MIN_LEAF_BOX, node.leaf.length * CHAR_PX + 14);
                return (
                  <>
                    <rect className="rg-box" x={-w / 2} y={-13} width={w} height={26} rx={6} />
                    <text className="rg-leaf" y={4} textAnchor="middle">{node.leaf.join('').replace(/ /g, '␣')}</text>
                  </>
                );
              }
              return (
                <>
                  <circle r={15} />
                  <text y={5} textAnchor="middle">{node.weight}</text>
                </>
              );
            }}
            nodeMark={(id) =>
              onPath.has(id) ? { tone: 'info', fill: 'tint' } : last?.created.has(id) ? { tone: 'hi', fill: 'tint', tint: 30 } : edited ? { tone: 'violet', fill: 'tint', tint: 10 } : null
            }
          />
        </WideRegion>
        <p className="rg-note">Each internal node shows its weight. Index i: go left if i is below the weight, otherwise subtract the weight and go right. Everything not coloured as new is the same node as before the edit.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every node count comes from the rope you see</Provenance>
        <Provenance kind="from-memory">Boehm, Atkinson and Plass, "Ropes: an Alternative to Strings" (1995), balances differently, with a length scheme based on Fibonacci numbers; verify</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

import { useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { KEY_MAX, KEY_MIN, NODE_LIMIT, parseKey, parseKeyList, refuseOp } from './keys';
import { buildRb, groupsOf, hasKey, insertKey, removeKey, sizeOf, type RbTree } from './model';
import { DEFAULT_SEED, GROUP_PRESETS, groupKeys } from './presets';
import { RbTreeView } from './RbTreeView';
import { groupsCaption } from './text';

type Source = (typeof GROUP_PRESETS)[number]['id'] | 'typed';

export function GroupsScene({ picker }: { picker: ReactNode }) {
  const [source, setSource] = useState<Source>('sorted');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [tree, setTree] = useState<RbTree>(() => buildRb(groupKeys('sorted', DEFAULT_SEED)).tree);
  const [grouped, setGrouped] = useState(true);
  const [listText, setListText] = useState('50 20 70 10 30');
  const [keyText, setKeyText] = useState('16');
  const [note, setNote] = useState<string | null>(null);
  const [splits, setSplits] = useState<number | null>(null);

  const groups = groupsOf(tree);
  const sizes = (n: number) => groups.filter((g) => g.keys.length === n).length;
  const leafDepths = new Set(groups.filter((g) => g.children.length === 0).map((g) => g.depth));
  const leafDepth = leafDepths.size === 1 ? [...leafDepths][0] : null;
  const base = groupsCaption({ twos: sizes(1), threes: sizes(2), fours: sizes(3), leafDepth, keys: sizeOf(tree) });
  const caption = splits ? `${base} That insert split ${splits} ${splits === 1 ? 'four-node' : 'four-nodes'}: parent and uncle turned black and the middle key moved up.` : base;
  useIntroCaption(<>{caption}</>, [caption]);

  const load = (id: Source, withSeed = seed) => {
    if (id === 'typed') return;
    setTree(buildRb(groupKeys(id, withSeed)).tree);
    setSource(id);
    setNote(null);
    setSplits(null);
  };
  const loadList = () => {
    const parsed = parseKeyList(listText);
    if (!parsed.ok) {
      setNote(parsed.error);
      return;
    }
    setTree(buildRb(parsed.value).tree);
    setSource('typed');
    setNote(null);
    setSplits(null);
  };
  const operate = (op: 'insert' | 'delete') => {
    const key = parseKey(keyText);
    const refusal = key.ok ? refuseOp(op, key.value, sizeOf(tree), hasKey(tree, key.value)) : key.error;
    if (refusal || !key.ok) {
      setNote(refusal);
      return;
    }
    setNote(null);
    if (op === 'insert') {
      const r = insertKey(tree, key.value, { record: true });
      setTree(r.tree);
      setSplits(r.steps.filter((s) => s.kind === 'violation' && s.case === 'uncle-red').length);
    } else {
      setTree(removeKey(tree, key.value).tree);
      setSplits(null);
    }
  };

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="2-nodes" value={sizes(1)} sub="a black node alone" />
          <Stat label="3-nodes" value={sizes(2)} sub="black with one red child" />
          <Stat label="4-nodes" value={sizes(3)} sub="black with two red children" />
          <Stat label="Leaf nodes at depth" value={leafDepth === null ? '?' : leafDepth} color={leafDepth === null ? 'var(--bad)' : 'var(--ok)'} sub="one depth: rule 4 from the 2-3-4 side" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--pink)', label: 'red node', shape: 'dot' },
            { color: 'var(--muted)', label: 'black node', shape: 'dot' },
            { color: 'var(--violet)', label: 'one 2-3-4 node (dashed box)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="View" value={grouped} onChange={setGrouped} off="Red-black tree" on="2-3-4 nodes" />
          <ControlGroup label="Load" inline>
            {GROUP_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={source === p.id} onClick={() => load(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          {source === 'random' && (
            <SeedField
              seed={seed}
              onSeed={(s) => {
                setSeed(s);
                load('random', s);
              }}
            />
          )}
        </>,
        <>
          <TextField label="Your keys, in order" value={listText} onChange={setListText} onEnter={loadList} width={200} spellCheck={false} />
          <Button onClick={loadList}>Build</Button>
          <TextField label="Key" value={keyText} onChange={setKeyText} onEnter={() => operate('insert')} width={80} spellCheck={false} />
          <Button variant="primary" onClick={() => operate('insert')}>
            Insert
          </Button>
          <Button onClick={() => operate('delete')}>Delete</Button>
          <Hint>
            <span role="status">{note ?? `Whole numbers from ${KEY_MIN} to ${KEY_MAX}, each once, up to ${NODE_LIMIT} nodes.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="rb-stage stage-pad">
        <RbTreeView tree={tree} badge="color" groups={grouped ? groups : null} ariaLabel={`Red-black tree of ${sizeOf(tree)} nodes${grouped ? ' regrouped as 2-3-4 nodes' : ''}`} />
        <Hint tone="muted" block>
          A 3-node looks the same with its red child on either side. Inserting under a 4-node is the uncle-red case: the 4-node splits and its middle key moves up to the parent.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the grouping is computed from the colours of the tree on screen</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

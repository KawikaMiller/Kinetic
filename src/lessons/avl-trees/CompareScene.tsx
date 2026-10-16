import { useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { AvlTreeView } from './AvlTreeView';
import { parseKeyList } from '../../core/keyInput';
import { buildAvl, buildBst, deepestPath, heightOf } from '../../core/avl';
import { COMPARE_PRESETS, DEFAULT_SEED, presetKeys, type ComparePreset } from './presets';
import { compareCaption } from './text';

type Source = ComparePreset['id'] | 'typed';

const DEEP_TINT = 24;

export function CompareScene({ picker }: { picker: ReactNode }) {
  const [source, setSource] = useState<Source>('sorted');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [typed, setTyped] = useState<number[]>([]);
  const [text, setText] = useState('50 20 70 10 30');
  const [note, setNote] = useState<string | null>(null);

  const keys = useMemo(() => (source === 'typed' ? typed : presetKeys(source, seed)), [source, seed, typed]);
  const plain = useMemo(() => buildBst(keys), [keys]);
  const avl = useMemo(() => buildAvl(keys), [keys]);
  const plainDeep = new Set(deepestPath(plain));
  const avlDeep = new Set(deepestPath(avl.tree));
  const caption = compareCaption({
    n: keys.length,
    plainHeight: heightOf(plain),
    avlHeight: heightOf(avl.tree),
    best: Math.ceil(Math.log2(keys.length + 1)),
    rotations: avl.rotations,
  });
  useIntroCaption(<>{caption}</>, [caption]);

  const apply = () => {
    const parsed = parseKeyList(text);
    if (!parsed.ok) {
      setNote(parsed.error);
      return;
    }
    setNote(null);
    setTyped(parsed.value);
    setSource('typed');
  };
  const choose = (id: ComparePreset['id']) => {
    setNote(null);
    setSource(id);
  };

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Plain height" value={heightOf(plain)} color={heightOf(plain) > heightOf(avl.tree) ? 'var(--bad)' : undefined} sub="levels; a lone node is 1" />
          <Stat label="AVL height" value={heightOf(avl.tree)} color="var(--ok)" sub={`best possible ${Math.ceil(Math.log2(keys.length + 1))}`} />
          <Stat label="AVL rotations" value={avl.rotations} sub="a double counts as two" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'plain tree: its deepest path', shape: 'dot' },
            { color: 'var(--ok)', label: 'AVL tree: its deepest path', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Keys" inline>
            {COMPARE_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={source === p.id} onClick={() => choose(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          {source === 'random' && <SeedField seed={seed} onSeed={setSeed} />}
        </>,
        <>
          <TextField label="Your keys, in order" value={text} onChange={setText} onEnter={apply} width={240} spellCheck={false} />
          <Button variant="primary" onClick={apply}>
            Build both
          </Button>
          <Hint>
            {note ?? 'Whole numbers from −999 to 999, up to 31, each once. Balance factor = height of the right subtree minus height of the left.'}
          </Hint>
        </>,
      ]}
    >
      <div className="avl-stage stage-pad">
        <SectionTitle>Plain binary search tree: no rebalancing</SectionTitle>
        <AvlTreeView
          tree={plain}
          showBalance={false}
          nodeMark={(k) => (plainDeep.has(k) && heightOf(plain) > heightOf(avl.tree) ? { tone: 'bad', fill: 'tint', tint: DEEP_TINT } : null)}
          ariaLabel={`Plain binary search tree of ${keys.length} keys, ${heightOf(plain)} levels tall`}
        />
        <SectionTitle>AVL tree: the same keys, rotating when a balance factor reaches ±2</SectionTitle>
        <AvlTreeView
          tree={avl.tree}
          nodeMark={(k) => (avlDeep.has(k) ? { tone: 'ok', fill: 'tint', tint: DEEP_TINT } : null)}
          ariaLabel={`AVL tree of ${keys.length} keys, ${heightOf(avl.tree)} levels tall`}
        />
      </div>
      <ProvenanceRow>
        <Provenance kind="real">every height, balance factor and rotation is computed from your keys, live</Provenance>
        {source === 'random' && <Provenance kind="simulated" seed={seed}>random order from a seeded generator</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}

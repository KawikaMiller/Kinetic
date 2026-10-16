import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, Hint, Segmented, Slider, Stat, TextField } from '../../components/ui';
import { mulberry32 } from '../../core/random';
import { DEFAULT_LEAVES, LEAF_MAX, LEAF_MIN, OPENING, parseLeaves, SPEC } from './presets';
import { SearchStage } from './SearchStage';
import { BOARD_WIDTH } from './TreeBoard';
import { firstLeaf, search } from './tree';
import { pathName } from './view';

const MOVES = [1, 2, 3].map((id) => ({ value: id, label: pathName(id, SPEC.b) }));

/** Scene 1, a tree you can edit: values come up from the leaves; predict the root's value and best first move before the run. */
export function MinimaxScene({ picker }: { picker: ReactNode }) {
  const [leaves, setLeaves] = useState<number[]>(OPENING.minimax.leaves.slice());
  const [draft, setDraft] = useState(OPENING.minimax.leaves.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(OPENING.minimax.selected);
  const [guessValue, setGuessValue] = useState<number>(OPENING.minimax.predictedValue);
  const [guessMove, setGuessMove] = useState<number>(OPENING.minimax.predictedMove);
  const [seed, setSeed] = useState(0);

  const result = useMemo(() => search(SPEC, leaves, { prune: false }), [leaves]);

  const commit = (next: number[]) => {
    setLeaves(next);
    setDraft(next.join(', '));
    setError(null);
  };
  const type = (text: string) => {
    setDraft(text);
    const parsed = parseLeaves(text);
    if (parsed.ok) {
      setLeaves(parsed.value);
      setError(null);
    } else {
      setError(parsed.error);
    }
  };
  const setLeaf = (value: number) => commit(leaves.map((v, i) => (i === selected ? value : v)));
  const randomise = () => {
    const rnd = mulberry32(seed + 1);
    setSeed((s) => s + 1);
    commit(leaves.map(() => LEAF_MIN + Math.floor(rnd() * (LEAF_MAX - LEAF_MIN + 1))));
  };

  const valueRight = guessValue === result.value;
  const moveRight = guessMove === result.bestChild;

  return (
    <SearchStage
      spec={SPEC}
      leaves={leaves}
      result={result}
      windows={false}
      marks={{ selected: firstLeaf(SPEC) + selected }}
      onNodeClick={(id) => id >= firstLeaf(SPEC) && setSelected(id - firstLeaf(SPEC))}
      ariaLabel="Game tree: three moves, three replies, three more moves, 27 leaf values; click a leaf to select it"
      extraStats={({ done }) => (
        <Stat
          label="Your prediction"
          value={done ? (valueRight && moveRight ? 'right' : valueRight || moveRight ? 'half right' : 'wrong') : 'committed'}
          color={done ? (valueRight && moveRight ? 'var(--ok)' : 'var(--bad)') : 'var(--dim)'}
          sub={
            done
              ? `you said ${guessValue} and move ${pathName(guessMove, SPEC.b)}; the tree says ${result.value} and ${pathName(result.bestChild, SPEC.b)}`
              : `you said ${guessValue} and move ${pathName(guessMove, SPEC.b)}: press play to check`
          }
        />
      )}
      controls={[
        picker,
        <>
          <Slider label={`Predict the root value`} value={guessValue} min={LEAF_MIN} max={LEAF_MAX} onChange={setGuessValue} />
          <Segmented label="Predict the best first move" value={guessMove} onChange={setGuessMove} options={MOVES} />
        </>,
        <>
          <Slider label={`Leaf ${selected + 1} value`} value={leaves[selected]} min={LEAF_MIN} max={LEAF_MAX} onChange={setLeaf} />
          <TextField label="All 27 leaves" value={draft} onChange={type} width={260} spellCheck={false} />
          <ChipButton tone="info" on={leaves.join(',') === DEFAULT_LEAVES.join(',')} onClick={() => commit(DEFAULT_LEAVES.slice())}>Default values</ChipButton>
          <Button onClick={randomise}>New random values</Button>
          <Hint><span role="status">{error ?? 'Click a leaf (or a cell below) to select it, then move the slider. Predict first, then press play.'}</span></Hint>
        </>,
      ]}
      below={({ done }) => (
        <>
          <WideRegion minWidth={BOARD_WIDTH} label="Leaf values: scroll sideways to see all of them">
            <ArrayStrip values={leaves} cellMax={34} showIndex fontSize={11} cellState={(i) => (i === selected ? 'active' : 'idle')} onCellClick={setSelected} cellTitle={(i) => `Select leaf ${i + 1}, value ${leaves[i]}`} pointers={[]} />
          </WideRegion>
          <p className="gt-note">
            A max node takes its largest child, a min node its smallest, from the leaves up.{' '}
            {done
              ? <>The root is a max node: its value is {result.value} and the best first move is {pathName(result.bestChild, SPEC.b)}. Your prediction {valueRight ? 'has the right value' : 'misses the value'} and {moveRight ? 'the right move' : 'a different move'}.</>
              : <>Predict the root's value and the best first move with the controls above, then press play: the answer appears when the run ends.</>}
          </p>
        </>
      )}
    />
  );
}

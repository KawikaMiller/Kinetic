import { useMemo, useState, type ReactNode } from 'react';
import { ChipButton, ControlGroup, Hint, Segmented } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { DiffScene } from './DiffScene';
import { KEY_MODES, LIST_PRESETS, TREE_OLD, TREE_PRESETS, countsOf, runDiff, runList, type Counts, type KeyMode, type ListPresetId, type TreePresetId } from './model';

const TREE_INTRO = (
  <>
    A card re-renders and returns a new tree (right). The diff walks both trees from the root and decides, node by node, which DOM calls are needed. Press play, or step with →.
  </>
);
const LIST_INTRO = (
  <>
    The same diff on a list of five. Pick a change and a key mode, then watch which rows are updated in place, moved, inserted or removed. Press play, or step with →.
  </>
);

export function TreeScene({ picker }: { picker: ReactNode }) {
  const [preset, setPreset] = useState<TreePresetId>('text');
  const scenario = useMemo(() => runDiff(TREE_OLD, TREE_PRESETS.find((p) => p.id === preset)!.next), [preset]);
  return (
    <DiffScene
      scenario={scenario}
      intro={TREE_INTRO}
      keyed={false}
      height={470}
      controls={[
        <>
          {picker}
          <ControlGroup label="The render returns">
            {TREE_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={preset === p.id} onClick={() => setPreset(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    />
  );
}

const ABBREV: [keyof Counts, string][] = [['update', 'upd'], ['replace', 'rep'], ['insert', 'ins'], ['move', 'mov'], ['remove', 'rem']];
const breakdown = (c: Counts) =>
  ABBREV.filter(([k]) => c[k] > 0).map(([k, a]) => `${c[k]} ${a}`).join(' · ') || 'none';

const COUNT_TABLE = LIST_PRESETS.map((p) => ({ preset: p, counts: KEY_MODES.map((m) => countsOf(runList(p.id, m.value).result)) }));

function CountTable({ preset, mode }: { preset: ListPresetId; mode: KeyMode }) {
  return (
    <WideRegion minWidth={420} label="DOM calls per change and key mode: scroll sideways to see all of it" hint="swipe to see the whole table">
      <table className="data-table vd-table">
        <caption className="vd-caption">DOM calls for each change, from this model (one call per patch)</caption>
        <thead>
          <tr>
            <th scope="col">Change</th>
            {KEY_MODES.map((m) => (
              <th key={m.value} scope="col">{m.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COUNT_TABLE.map(({ preset: p, counts }) => (
            <tr key={p.id}>
              <th scope="row" className="keep-case">{p.label}</th>
              {counts.map((c, i) => (
                <td key={KEY_MODES[i].value} className={p.id === preset && KEY_MODES[i].value === mode ? 'vd-now' : ''}>
                  <b>{c.ops}</b> <span className="vd-break">{breakdown(c)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </WideRegion>
  );
}

export function ListScene({ picker }: { picker: ReactNode }) {
  const [preset, setPreset] = useState<ListPresetId>('insert-start');
  const [mode, setMode] = useState<KeyMode>('none');
  const scenario = useMemo(() => runList(preset, mode), [preset, mode]);
  return (
    <DiffScene
      scenario={scenario}
      intro={LIST_INTRO}
      keyed={mode !== 'none'}
      height={660}
      extra={
        <>
          <CountTable preset={preset} mode={mode} />
          <Hint block>
            No keys and index keys always give the same result: with no key, React matches children by position, which is exactly what an index key says. Only a key that follows the item (an id) lets the diff recognise an item that moved.
            Moves here use the placement rule React uses; other frameworks can need fewer moves for the same change.
          </Hint>
        </>
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Change">
            {LIST_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={preset === p.id} onClick={() => setPreset(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="Keys" value={mode} onChange={setMode} options={KEY_MODES} />
        </>,
      ]}
    />
  );
}

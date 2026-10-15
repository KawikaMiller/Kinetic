import { useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { Dag } from './Dag';
import { parseIndex, parseValue, refuseVersion } from './keys';
import { capacity, corruptCells, createStore, pathOf, reachable, setValue, updateMode, valuesOf, type Store } from './model';
import { SMALL_B, SMALL_VALUES, DEFAULT_EDIT_INDEX, DEFAULT_EDIT_VALUE } from './presets';
import { pathCaption } from './text';

/** Scenes 1 and 2: the same editor. In `broken` mode a toggle swaps path copying for in-place mutation. */
export function PathScene({ picker, broken }: { picker: ReactNode; broken: boolean }) {
  const [store, setStore] = useState<Store>(() => createStore(SMALL_VALUES, SMALL_B));
  const [view, setView] = useState(0);
  const [indexText, setIndexText] = useState(String(DEFAULT_EDIT_INDEX));
  const [valueText, setValueText] = useState(String(DEFAULT_EDIT_VALUE));
  const [inPlace, setInPlace] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const n = capacity(store);
  const last = store.versions[store.versions.length - 1];
  const shown = store.versions[view];
  const mode = updateMode(broken, inPlace);

  const values = valuesOf(store, view);
  const corrupt = corruptCells(store, view);
  const parentReach = last.parent === null ? new Set<number>() : reachable(store, [last.parent]);
  const sharedWithParent = last.parent === null ? 0 : [...reachable(store, [last.id])].filter((id) => parentReach.has(id)).length;
  const caption = pathCaption({
    n,
    levels: store.depth + 1,
    version: last.id,
    parent: last.parent,
    edit: last.edit,
    copied: last.copied.length,
    shared: sharedWithParent,
    total: reachable(store, [last.id]).size,
    stored: store.nodes.length,
    corruptViewed: corrupt.length ? { version: view, cells: corrupt } : null,
  });
  useIntroCaption(<>{caption}</>, [caption]);

  const set = () => {
    const index = parseIndex(indexText, n);
    const value = parseValue(valueText);
    const refusal = !index.ok ? index.error : !value.ok ? value.error : refuseVersion(store.versions.length);
    if (refusal || !index.ok || !value.ok) {
      setNote(refusal);
      return;
    }
    setNote(null);
    setStore(setValue(store, last.id, index.value, value.value, mode));
    setView(mode === 'inplace' ? 0 : store.versions.length);
  };
  const reset = () => {
    setStore(createStore(SMALL_VALUES, SMALL_B));
    setView(0);
    setNote(null);
  };

  const fresh = new Set(last.copied);
  const selected = new Set(shown.edit ? pathOf(store, view, shown.edit.index) : [shown.root]);
  const corruptLeaves = new Set(corrupt.map((i) => pathOf(store, view, i)[store.depth]));
  const parsedIndex = parseIndex(indexText, n);
  const cellState = (i: number): ArrayCellState => (corrupt.includes(i) ? 'bad' : shown.edit?.index === i ? 'active' : 'idle');

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Nodes allocated" value={last.parent === null ? '–' : last.copied.length} color={last.copied.length ? 'var(--hi)' : undefined} sub={last.parent === null ? 'by the last update' : last.copied.length ? `by v${last.id}: one per level, plus the leaf` : 'an in-place edit copies nothing'} />
          <Stat label="Shared with parent" value={last.parent === null ? '–' : sharedWithParent} color={last.parent === null ? undefined : 'var(--violet)'} sub={`of ${reachable(store, [last.id]).size} nodes in v${last.id}`} />
          <Stat label="Nodes stored" value={store.nodes.length} sub={`${store.versions.length} ${store.versions.length === 1 ? 'version' : 'versions'}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'allocated by the last update', shape: 'dot' },
            { color: 'var(--violet)', label: 'shared by two or more versions (count shown)', shape: 'dot' },
            { color: 'var(--info)', label: 'the viewed version: root and edited path', shape: 'dot' },
            ...(broken ? [{ color: 'var(--bad)', label: 'changed behind a version’s back', shape: 'dot' as const }] : []),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Viewing version" value={view} min={0} max={store.versions.length - 1} onChange={setView} format={(v) => `v${v}`} />
        </>,
        <>
          <TextField label="Cell" value={indexText} onChange={setIndexText} onEnter={set} width={64} spellCheck={false} />
          <TextField label="New value" value={valueText} onChange={setValueText} onEnter={set} width={84} spellCheck={false} />
          {broken && <Toggle label="Update by" value={inPlace} onChange={setInPlace} off="Copying the path" on="Mutating in place" />}
          <Button variant="primary" onClick={set}>
            Set
          </Button>
          <Button onClick={reset}>Reset</Button>
          <Hint>
            <span role="status">{note ?? `${n} cells, cell numbers 0 to ${n - 1}; press a cell below to pick it. Up to 11 updates are drawn.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="pds-stage stage-pad">
        <Tray label={`Version v${view} read by walking down from its root`} labelWeight="regular" stack ariaLabel="Version contents">
          <ArrayStrip
            values={values}
            cellState={cellState}
            pointers={parsedIndex.ok ? [{ i: parsedIndex.value, label: 'cell', tone: 'info' }] : []}
            onCellClick={(i) => setIndexText(String(i))}
            cellTitle={(i) => `Pick cell ${i}`}
            showIndex
            cellMax={64}
            fontSize={13}
          />
          {broken && (
            <ArrayStrip values={shown.recorded} cellTone={(i) => (corrupt.includes(i) ? { tone: 'ok', fill: 'tint' } : null)} showIndex cellMax={64} fontSize={13} />
          )}
        </Tray>
        {broken && <Hint tone="muted" block>{corrupt.length ? `The lower row is what v${view} held when it was made. The upper row now differs at cell${corrupt.length > 1 ? 's' : ''} ${corrupt.join(', ')}: an older version changed.` : `The lower row is what v${view} held when it was made; it matches the walked contents.`}</Hint>}
        <Dag store={store} marks={{ fresh, selected, corrupt: corruptLeaves, view }} ariaLabel={`DAG of ${store.versions.length} versions over ${store.nodes.length} nodes`} />
      </div>
      <ProvenanceRow>
        <Provenance kind="real">every node and pointer is built by the code that reads it; the contents shown are read by walking the tree</Provenance>
        {broken && <Provenance kind="scripted">the in-place mode is the deliberately wrong update, switched on by you</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}

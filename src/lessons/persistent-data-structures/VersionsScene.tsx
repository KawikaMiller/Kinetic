import { useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { Dag } from './Dag';
import { parseIndex, parseValue, refuseVersion } from './keys';
import { capacity, childrenOf, memorySlots, pathOf, reachable, setValue, valuesOf } from './model';
import { docStart, type DocState } from './docState';
import { docCaption } from './text';

const TREE_WIDTH = 360;
const TREE_HEIGHT = 170;

export function VersionsScene({ picker }: { picker: ReactNode }) {
  const [doc, setDoc] = useState<DocState>(docStart);
  const [indexText, setIndexText] = useState('4');
  const [valueText, setValueText] = useState('42');
  const [note, setNote] = useState<string | null>(null);
  const { store, current, redo, live } = doc;
  const n = capacity(store);
  const alive = reachable(store, live);
  const garbage = store.nodes.length - alive.size;
  const memory = memorySlots(store, live);
  const caption = docCaption({ current, live: live.length, versions: store.versions.length, stored: store.nodes.length, garbage, memory });
  useIntroCaption(<>{caption}</>, [caption]);

  const edit = () => {
    const index = parseIndex(indexText, n);
    const value = parseValue(valueText);
    const refusal = !index.ok ? index.error : !value.ok ? value.error : refuseVersion(store.versions.length);
    if (refusal || !index.ok || !value.ok) {
      setNote(refusal);
      return;
    }
    setNote(null);
    setDoc({ store: setValue(store, current, index.value, value.value), current: store.versions.length, redo: [], live: [...live, store.versions.length] });
  };
  const goto = (id: number) => setDoc({ ...doc, current: id, redo: [] });
  const parent = store.versions[current].parent;
  const canUndo = parent !== null && live.includes(parent);
  const canRedo = redo.length > 0;
  const undo = () => canUndo && setDoc({ ...doc, current: parent, redo: [...redo, current] });
  const redoStep = () => canRedo && setDoc({ ...doc, current: redo[redo.length - 1], redo: redo.slice(0, -1) });
  const drop = (id: number) => setDoc({ ...doc, live: live.filter((v) => v !== id), redo: redo.filter((v) => v !== id) });

  const shape: TreeShape<number> = { root: 0, children: (id) => childrenOf(store, id) };
  const values = valuesOf(store, current);
  const version = store.versions[current];
  const selected = new Set(version.edit ? pathOf(store, current, version.edit.index) : [version.root]);
  const droppable = live.filter((v) => v !== current);

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Versions alive" value={live.length} sub={`of ${store.versions.length} made`} />
          <Stat label="Garbage nodes" value={garbage} sub="no live version reaches them" />
          <Stat label="Memory" value={memory} sub={`slots stored by ${alive.size} live nodes`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'viewed version: root and edited path', shape: 'dot' },
            { color: 'var(--violet)', label: 'shared by two or more live versions', shape: 'dot' },
            { color: 'var(--dim)', label: 'garbage: nothing live reaches it', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button softDisabled={!canUndo} onClick={undo}>
            Undo
          </Button>
          <Button softDisabled={!canRedo} onClick={redoStep}>
            Redo
          </Button>
          <ControlGroup label="Drop a version" inline>
            {droppable.length === 0 ? <Hint>nothing else is alive</Hint> : null}
            {droppable.map((v) => (
              <ChipButton key={v} tone="bad" ariaLabel={`Drop version ${v}`} onClick={() => drop(v)}>
                {`v${v}`}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField label="Cell" value={indexText} onChange={setIndexText} onEnter={edit} width={64} spellCheck={false} />
          <TextField label="New value" value={valueText} onChange={setValueText} onEnter={edit} width={84} spellCheck={false} />
          <Button variant="primary" onClick={edit}>
            Set
          </Button>
          <Button onClick={() => setDoc(docStart())}>Reset</Button>
          <Hint>
            <span role="status">{note ?? `A ${n}-cell document; a set makes a new version from the one you are viewing. Press a version below to view it.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="pds-stage stage-pad">
        <Tray label={`Document at v${current}`} labelWeight="regular" stack ariaLabel="Document">
          <ArrayStrip
            values={values}
            cellState={(i) => (version.edit?.index === i ? 'active' : 'idle')}
            onCellClick={(i) => setIndexText(String(i))}
            cellTitle={(i) => `Pick cell ${i}`}
            showIndex
            cellMax={56}
            fontSize={12}
          />
        </Tray>
        <TreeSvg
          shape={shape}
          layout="tidy"
          width={TREE_WIDTH}
          height={TREE_HEIGHT}
          pad={30}
          top={26}
          levelGap={44}
          radius={15}
          natural
          label={(id) => `v${id}`}
          nodeMark={(id) => (!live.includes(id) ? { tone: 'dim', fill: 'tint' } : id === current ? { tone: 'info', fill: 'solid' } : null)}
          onNodeClick={(id) => live.includes(id) && goto(id)}
          nodeAriaLabel={(id) => `Version ${id}${id === current ? ', viewing' : live.includes(id) ? '' : ', dropped'}`}
          ariaLabel="Version tree: each version points to the one it was made from"
        />
        <Dag store={store} marks={{ selected, live, view: current }} ariaLabel={`DAG of ${store.versions.length} versions; ${garbage} nodes are garbage`} />
      </div>
      <ProvenanceRow>
        <Provenance kind="real">undo is a pointer into the version list; the live set and the garbage are computed by walking from the live roots</Provenance>
        <Provenance kind="illustrative">real systems free memory with their own collectors; this mark pass shows the idea, not any one runtime</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

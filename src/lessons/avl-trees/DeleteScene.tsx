import { useState, type ReactNode } from 'react';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { AvlTreeView } from './AvlTreeView';
import { KeyOps } from './KeyOps';
import { AVL_LEGEND, frameEdgeMark, frameNodeMark, frameScale } from './marks';
import { buildAvl, heightOf, sizeOf } from './model';
import { DELETE_DEFAULT_KEY, DELETE_TREE_HEIGHT, SORTED_KEYS, deleteBase } from './presets';
import { useAvlSession, type AvlStart } from './useAvlSession';

const STEP_MS = 1000;
const PERFECT_DELETE_KEY = 8;

interface DeletePreset {
  id: 'thin' | 'perfect';
  label: string;
  start: () => AvlStart;
}
const PRESETS: DeletePreset[] = [
  { id: 'thin', label: `Thinnest tree, height ${DELETE_TREE_HEIGHT}`, start: () => ({ base: deleteBase(), op: 'delete', key: DELETE_DEFAULT_KEY }) },
  { id: 'perfect', label: 'Perfect tree, 1 to 15', start: () => ({ base: buildAvl(SORTED_KEYS).tree, op: 'delete', key: PERFECT_DELETE_KEY }) },
];

export function DeleteScene({ picker }: { picker: ReactNode }) {
  const first = PRESETS[0];
  const session = useAvlSession(first.start);
  const [keyText, setKeyText] = useState(String(DELETE_DEFAULT_KEY));
  const [loaded, setLoaded] = useState<DeletePreset['id'] | null>(first.id);
  const player = usePlayer(session.frames, { interval: STEP_MS });
  const f = player.frame;

  const load = (p: DeletePreset) => {
    const start = p.start();
    player.queueNext({ play: false });
    session.restart(start);
    setKeyText(String(start.key));
    setLoaded(p.id);
  };
  const submit = (op: 'insert' | 'delete') => {
    if (session.submit(op, keyText)) setLoaded(null);
  };

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Nodes" value={sizeOf(f.tree)} />
          <Stat label="Height" value={heightOf(f.tree)} sub="levels; a lone node is 1" />
          <Stat label="Rotations" value={f.rotations} color={f.rotations ? 'var(--violet)' : undefined} sub="this operation; a double counts as two" />
          <Stat label="Ancestors fixed" value={f.fixes} sub="imbalances repaired on the way up" />
        </Stats>
      }
      legend={<Legend items={[...AVL_LEGEND, { color: 'var(--info)', label: 'successor lifted in', shape: 'dot' }]} />}
      controls={[
        <>
          {picker}
          <ControlGroup label="Load" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={loaded === p.id} onClick={() => load(p)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <KeyOps keyText={keyText} onKeyText={setKeyText} onInsert={() => submit('insert')} onDelete={() => submit('delete')} note={session.note} />
        </>,
      ]}
    >
      <div className="avl-stage stage-pad avl-split">
        <div className="avl-main">
          <AvlTreeView
            tree={f.tree}
            showHeight
            nodeMark={frameNodeMark(f)}
            edgeMark={frameEdgeMark(f)}
            nodeScale={frameScale(f)}
            ariaLabel={`AVL tree of ${sizeOf(f.tree)} nodes, ${heightOf(f.tree)} levels tall`}
          />
        </div>
        <div className="avl-side">
          <Tray label="Rotations this operation" labelWeight="regular" stack empty="none yet" ariaLabel="Rotation ledger">
            <ol className="avl-ledger">
              {f.log.map((line, i) => (
                <li key={`${i}-${line}`}>{line}</li>
              ))}
            </ol>
          </Tray>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">a delete uses the trees-bst rule (in-order successor), then the same retrace as an insert, all computed live</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

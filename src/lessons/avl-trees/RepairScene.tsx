import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { AvlTreeView } from './AvlTreeView';
import { CaseSketch } from './CaseSketch';
import { KeyOps } from './KeyOps';
import { AVL_LEGEND, frameEdgeMark, frameNodeMark, frameScale } from './marks';
import { levelsOf, sizeOf } from './model';
import { CASE_PRESETS, REPAIR_DEFAULT, caseBase, casePreset, type CasePreset } from './presets';
import { useAvlSession } from './useAvlSession';

const STEP_MS = 1100;

export function RepairScene({ picker }: { picker: ReactNode }) {
  const first = casePreset(REPAIR_DEFAULT);
  const session = useAvlSession(() => ({ base: caseBase(first.id), op: 'insert', key: first.key }));
  const [keyText, setKeyText] = useState(String(first.key));
  const [loaded, setLoaded] = useState<CasePreset['id'] | null>(first.id);
  const player = usePlayer(session.frames, { interval: STEP_MS });
  const f = player.frame;

  const load = (p: CasePreset) => {
    player.queueNext({ play: false });
    session.restart({ base: caseBase(p.id), op: 'insert', key: p.key });
    setKeyText(String(p.key));
    setLoaded(p.id);
  };
  const submit = (op: 'insert' | 'delete') => {
    if (session.submit(op, keyText)) setLoaded(null);
  };

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label="Nodes" value={sizeOf(f.tree)} />
          <Stat label="Height" value={levelsOf(f.tree)} sub="levels; a lone node is 1" />
          <Stat label="Rotations" value={f.rotations} color={f.rotations ? 'var(--violet)' : undefined} sub="this operation; a double counts as two" />
        </Stats>
      }
      legend={<Legend items={AVL_LEGEND} />}
      controls={[
        <>
          {picker}
          <ControlGroup label="Load a case" inline>
            {CASE_PRESETS.map((p) => (
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
            ariaLabel={`AVL tree of ${sizeOf(f.tree)} nodes, ${levelsOf(f.tree)} levels tall`}
          />
        </div>
        <div className="avl-side">
          {f.caseAt ? <CaseSketch kind={f.caseAt} /> : <Hint tone="muted" block>When a node goes out of balance, the matching case is sketched here: z is the node, y its heavy child, x the grandchild.</Hint>}
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">each height, balance factor and rotation is computed from the tree you see, step by step</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

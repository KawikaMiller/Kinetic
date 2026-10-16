import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import type { TreeNodeMark } from '../../components/TreeSvg';
import { AvlTreeView } from './AvlTreeView';
import { CaseSketch } from './CaseSketch';
import { applyChoice, stopAtImbalance, unbalancedNodes, type Choice, type PickOutcome } from './model';
import { heightOf, type Case } from '../../core/avl';
import { CASE_PRESETS, PICK_DEFAULT, caseBase, casePreset } from './presets';
import { CHOICE_LABEL, pickCaption } from './text';

const CHOICES: Choice[] = ['right', 'left', 'left-right', 'right-left'];

interface Attempt {
  choice: Choice;
  outcome: PickOutcome;
}

export function PickScene({ picker }: { picker: ReactNode }) {
  const [caseId, setCaseId] = useState<Case>(PICK_DEFAULT);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [attempts, setAttempts] = useState(0);
  const state = useMemo(() => stopAtImbalance(caseBase(caseId), casePreset(caseId).key)!, [caseId]);

  const tree = attempt?.outcome.applied ? attempt.outcome.tree : state.tree;
  const outOfBalance = attempt?.outcome.applied ? attempt.outcome.unbalanced : unbalancedNodes(state.tree);
  const caption = pickCaption(state, attempt);
  useIntroCaption(<>{caption}</>, [caption]);

  const choose = (choice: Choice) => {
    setAttempt({ choice, outcome: applyChoice(state, choice) });
    setAttempts((n) => n + 1);
  };
  const load = (id: Case) => {
    setCaseId(id);
    setAttempt(null);
    setAttempts(0);
  };
  const moved = new Set(attempt?.outcome.applied ? attempt.outcome.touched.map((t) => t.key) : []);
  const nodeMark = (k: number): TreeNodeMark | null => {
    if (outOfBalance.includes(k)) return { tone: 'bad', fill: 'solid' };
    if (moved.has(k)) return { tone: 'violet', fill: 'solid' };
    if (!attempt && k === state.key) return { tone: 'hi', fill: 'solid' };
    return null;
  };
  const verdict = attempt === null ? null : attempt.outcome.valid;

  return (
    <StageFrame
      height={440}
      stats={
        <Stats>
          <Stat label="Attempts" value={attempts} sub="presses since you loaded this case" />
          <Stat label="Out of balance" value={outOfBalance.length} color={outOfBalance.length ? 'var(--bad)' : 'var(--ok)'} sub={`nodes beyond ±1, tree height ${heightOf(tree)}`} />
          <Stat
            label="Tree is a valid AVL tree"
            value={verdict === null ? 'not yet' : verdict ? 'yes' : 'no'}
            color={verdict === null ? undefined : verdict ? 'var(--ok)' : 'var(--bad)'}
            sub="every balance factor within ±1, rechecked from the shape"
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the key just inserted', shape: 'dot' },
            { color: 'var(--bad)', label: 'out of balance', shape: 'dot' },
            { color: 'var(--violet)', label: 'moved by your rotation', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Tree" inline>
            {CASE_PRESETS.map((p, i) => (
              <ChipButton key={p.id} tone="info" on={caseId === p.id} onClick={() => load(p.id)}>
                Puzzle {i + 1}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <ControlGroup label="Your rotation" inline>
            {CHOICES.map((c) => (
              <ChipButton key={c} tone="violet" size="md" on={attempt?.choice === c} onClick={() => choose(c)}>
                {CHOICE_LABEL[c]}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button softDisabled={attempt === null} onClick={() => setAttempt(null)}>
            Undo
          </Button>
          <Hint>Rotating right lifts a node's left child; rotating left lifts its right child. The sketch appears after your first try.</Hint>
        </>,
      ]}
    >
      <div className="avl-stage stage-pad avl-split">
        <div className="avl-main">
          <AvlTreeView tree={tree} nodeMark={nodeMark} ariaLabel={`Tree stopped at ${state.at}, ${outOfBalance.length} nodes out of balance`} />
        </div>
        <div className="avl-side">
          {attempt ? <CaseSketch kind={state.case} /> : <Hint tone="muted" block>Which of the four rotations repairs this tree? Work out which way the heavy side leans, then press one.</Hint>}
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">your rotation is applied to the real tree and the result rechecked from its shape</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

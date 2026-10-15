import { useRef, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Link } from 'react-router-dom';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import {
  ITEMS, ITEM_ENTROPY, OPTIMAL_QUESTIONS, evenByCount, expectedQuestions, hintSplit, openSets, optimalTree, pathKey, rootNode, split, type QNode, type QPath,
} from './questions';
import { bits2, bits3, questionsCaption, questionsVerdict } from './text';

const ALL_ITEMS = ITEMS.map((_, i) => i);
const newTree = () => rootNode(ITEMS.length);
/** The question-count bar spans 0 to this many questions (a one-question-per-item chain would need 7). */
const BAR_MAX = 4;
const names = (items: readonly number[]) => items.map((i) => ITEMS[i].label).join(' ');

interface NodeProps {
  node: QNode;
  path: QPath;
  depth: number;
  picks: Record<string, number[]>;
  onPick: (path: QPath, item: number) => void;
  onSplit: (path: QPath) => void;
}

function QuestionNode({ node, path, depth, picks, onPick, onSplit }: NodeProps) {
  const key = pathKey(path);
  if (node.yes && node.no) {
    return (
      <div className="ent-qnode">
        <p className="ent-qline">
          <span className="ent-qnum">Q{depth + 1}</span> Is it one of {names(node.yes.items)}?
        </p>
        <div className="ent-qchildren">
          {([['yes', node.yes, 0], ['no', node.no, 1]] as const).map(([label, child, step]) => (
            <div key={label} className="ent-qbranch">
              <span className="ent-qanswer">{label}</span>
              <QuestionNode node={child} path={[...path, step]} depth={depth + 1} picks={picks} onPick={onPick} onSplit={onSplit} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (node.items.length === 1) {
    const item = ITEMS[node.items[0]];
    return (
      <p className="ent-leaf">
        <b>{item.label}</b> found after {depth} {depth === 1 ? 'question' : 'questions'} (p {bits2(item.p)})
      </p>
    );
  }
  const chosen = picks[key] ?? [];
  const valid = chosen.length > 0 && chosen.length < node.items.length;
  return (
    <div className="ent-open">
      <p className="ent-qline">
        One of {names(node.items)}: choose the items that answer yes.
      </p>
      <div className="ent-chips">
        {node.items.map((i) => (
          <ChipButton key={i} tone="info" on={chosen.includes(i)} ariaLabel={`${ITEMS[i].label}, probability ${bits2(ITEMS[i].p)}: yes side`} onClick={() => onPick(path, i)}>
            {ITEMS[i].label} {bits2(ITEMS[i].p)}
          </ChipButton>
        ))}
        <Button variant="primary" softDisabled={!valid} onClick={() => onSplit(path)}>
          Split here
        </Button>
      </div>
    </div>
  );
}

export function QuestionsScene({ picker }: { picker: ReactNode }) {
  const [tree, setTree] = useState<QNode>(newTree);
  const [history, setHistory] = useState<QNode[]>([]);
  const [picks, setPicks] = useState<Record<string, number[]>>({});
  const [note, setNote] = useState('');
  const undoRef = useRef<HTMLButtonElement>(null);

  const expected = expectedQuestions(tree);
  const open = openSets(tree).length;
  const verdict = questionsVerdict(expected, OPTIMAL_QUESTIONS);

  const replace = (next: QNode, message: string) => {
    setHistory((h) => [...h, tree]);
    setTree(next);
    setPicks({});
    setNote(message);
  };
  const onPick = (path: QPath, item: number) => {
    const key = pathKey(path);
    setPicks((p) => {
      const now = p[key] ?? [];
      return { ...p, [key]: now.includes(item) ? now.filter((x) => x !== item) : [...now, item] };
    });
  };
  const onSplit = (path: QPath) => {
    const result = split(tree, path, picks[pathKey(path)] ?? []);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    replace(result.value, `Split into yes and no.`);
    undoRef.current?.focus();
  };
  const hint = () => {
    const result = hintSplit(tree);
    if (result.ok) replace(result.value, 'Hint: split the first open set so the yes side holds close to half its probability.');
    else setNote(result.error);
  };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(history.slice(0, -1));
    setTree(last);
    setPicks({});
    setNote('Undid the last split.');
  };

  return (
    <StageFrame
      height={460}
      intro={questionsCaption(expected, open, OPTIMAL_QUESTIONS, ITEM_ENTROPY)}
      introKey={[expected, open]}
      stats={
        <Stats>
          <Stat
            label="Expected questions"
            value={expected === null ? '–' : bits3(expected)}
            color={verdict.tone === 'ok' ? 'var(--ok)' : verdict.tone === 'orange' ? 'var(--orange)' : undefined}
            sub={[expected === null ? `${open} ${open === 1 ? 'set' : 'sets'} left to split` : 'sum of p × depth', verdict.text]}
          >
            <Bar value={expected ?? 0} max={BAR_MAX} tone={verdict.tone === 'ok' ? 'ok' : 'orange'} height={8} markers={[{ at: ITEM_ENTROPY, tone: 'violet' }, { at: OPTIMAL_QUESTIONS, tone: 'ok' }]} ariaLabel={`Expected questions ${expected === null ? 'not yet known' : bits3(expected)}; entropy ${bits3(ITEM_ENTROPY)}; best tree ${bits3(OPTIMAL_QUESTIONS)}`} />
          </Stat>
          <Stat label="Entropy floor" value={bits3(ITEM_ENTROPY)} color="var(--violet)" sub="no tree goes below it" />
          <Stat label="Best tree" value={bits3(OPTIMAL_QUESTIONS)} color="var(--ok)" sub="Huffman's merge" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'an item, with its probability' },
            { color: 'var(--violet)', label: 'entropy floor', shape: 'line' },
            { color: 'var(--ok)', label: 'the best tree' },
            { color: 'var(--orange)', label: 'your tree, above the best' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button ref={undoRef} softDisabled={history.length === 0} onClick={undo}>
            Undo split
          </Button>
          <Button onClick={hint}>Hint: split by probability</Button>
        </>,
        <>
          <ChipButton tone="info" onClick={() => replace(evenByCount(ALL_ITEMS), 'Every set split in half by item count.')}>
            Split by count
          </ChipButton>
          <ChipButton tone="ok" onClick={() => replace(optimalTree(), "The tree Huffman's merge builds: the lightest two items share the deepest question.")}>
            Show the best tree
          </ChipButton>
          <ChipButton tone="bad" ariaLabel="Start over" onClick={() => replace(newTree(), 'Started over.')}>
            Reset
          </ChipButton>
          <Hint>The best tree is the one <Link to="/lesson/huffman-coding">Huffman coding</Link> builds from these probabilities.</Hint>
        </>,
      ]}
    >
      <div className="ent-stage stage-pad">
        <p className="ent-note" role="status">{note || 'Pick the items that answer yes, then Split here.'}</p>
        <div className="ent-tree" role="group" aria-label="Question tree">
          <QuestionNode node={tree} path={[]} depth={0} picks={picks} onPick={onPick} onSplit={onSplit} />
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">eight made-up items with fixed probabilities; the best tree and every cost are computed live</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { dfaRun, edgesOf, type Dfa, type State } from '../../core/automata';
import { circlePositions } from '../../core/graphLayout';
import { plainTone, toneVar } from '../../core/tone';
import { minimiseCaption } from './captions';
import { cardById } from './languages';
import { EXAMPLES, distinguishing, prefixClasses, quotient, refine } from './minimize';
import { OPENING } from './opening';

const GRAPH_W = 380;
const GRAPH_H = 300;
const NODE_PAD = 44;
const MAX_PREFIX = 8;
const ANBN = cardById('anbn').member!;

const toNodes = (dfa: Dfa, at: Map<State, { x: number; y: number }>): GraphNode<State>[] => dfa.states.map((s) => ({ id: s, at: at.get(s), accept: dfa.accept.includes(s) }));
const toEdges = (dfa: Dfa): GraphEdge<State>[] => edgesOf(dfa).map((e) => ({ from: e.from, to: e.to, label: e.symbols.join(',') }));

/** Scene 3: claim two states equivalent, or let partition refinement find the classes. */
export function MinimiseScene({ picker }: { picker: ReactNode }) {
  const [exampleId, setExampleId] = useState(OPENING.minimise.example);
  const example = EXAMPLES.find((e) => e.id === exampleId)!;
  const dfa = example.dfa;
  const rounds = useMemo(() => refine(dfa), [dfa]);
  const [round, setRound] = useState<number | null>(null);
  const [picked, setPicked] = useState<State[]>([]);
  const [merged, setMerged] = useState<State[]>([]);
  const [message, setMessage] = useState<ReactNode>(null);
  const at = useMemo(() => circlePositions(dfa.states, GRAPH_W, GRAPH_H, NODE_PAD), [dfa]);
  const partition = round === null ? null : rounds[round];
  const stable = round !== null && round === rounds.length - 1;
  const small = stable ? quotient(dfa, rounds[rounds.length - 1]) : null;
  const smallAt = useMemo(() => (small ? circlePositions(small.states, GRAPH_W, GRAPH_H, NODE_PAD) : null), [small]);
  const growth = useMemo(
    () => Array.from({ length: MAX_PREFIX }, (_, i) => i + 1).map((k) => ({ k, classes: prefixClasses(ANBN, ['a', 'b'], Array.from({ length: k + 1 }, (_, i) => 'a'.repeat(i)), k + 1) })),
    [],
  );

  const load = (id: string) => {
    setExampleId(id);
    setRound(null);
    setPicked([]);
    setMerged([]);
    setMessage(null);
  };
  const pick = (s: State) => {
    setMessage(null);
    setPicked((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : prev.length === 2 ? [prev[1], s] : [...prev, s]));
  };
  const claim = () => {
    const [p, q] = picked;
    const w = distinguishing(dfa, p, q);
    const run = (s: State, word: string) => (dfaRun({ ...dfa, start: s }, word).path as State[]).join(' → ');
    if (w === null) setMerged((prev) => [...new Set([...prev, p, q])]);
    setMessage(
      w === null ? (
        <>
          <code>{p}</code> and <code>{q}</code> are equivalent: no string tells them apart, so they can merge.
        </>
      ) : (
        <>
          Not equivalent. The shortest string that separates them is <code>{w === '' ? 'ε' : w}</code>: from <code>{p}</code> it runs {run(p, w)} ({dfa.accept.includes(dfaRun({ ...dfa, start: p }, w).path.at(-1) as State) ? 'accepted' : 'rejected'}), from <code>{q}</code> it runs {run(q, w)} ({dfa.accept.includes(dfaRun({ ...dfa, start: q }, w).path.at(-1) as State) ? 'accepted' : 'rejected'}).
        </>
      ),
    );
  };

  return (
    <StageFrame
      height={560}
      intro={minimiseCaption({ states: dfa.states.length, round, classes: partition ? partition.count : null, stable })}
      introKey={`${exampleId}|${round}`}
      stats={
        <Stats>
          <Stat label="States" value={dfa.states.length} color="var(--info)" sub="in the machine as written" />
          <Stat label="Classes" value={partition ? partition.count : 'not run'} color={stable ? 'var(--ok)' : 'var(--muted)'} sub={stable ? 'the smallest DFA has this many states' : 'after the round shown'} />
          <Stat label="Round" value={round === null ? 'none' : round} color="var(--violet)" sub="partition refinement" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a state you selected', shape: 'dot' },
            { color: 'var(--amber)', label: 'a class (plain categories)', shape: 'dot' },
            { color: 'var(--violet)', label: 'states merged because they are equivalent', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Machine">
            {EXAMPLES.map((e) => (
              <ChipButton key={e.id} tone="info" on={e.id === exampleId} onClick={() => load(e.id)}>
                {e.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Button variant="primary" softDisabled={stable} onClick={() => setRound(round === null ? 0 : Math.min(round + 1, rounds.length - 1))}>
            {round === null ? 'Refine' : stable ? 'Refined' : 'Refine again'}
          </Button>
          <Button softDisabled={picked.length !== 2} onClick={claim}>
            Claim these two are equivalent
          </Button>
          <Button
            onClick={() => {
              setRound(null);
              setPicked([]);
              setMerged([]);
              setMessage(null);
            }}
          >
            Reset
          </Button>
          <Hint tone="muted" block>
            <span role="status">{message ?? (picked.length === 2 ? <>Selected {picked[0]} and {picked[1]}.</> : <>Select two states (click, or Tab and Enter) to claim they are equivalent.</>)}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="ch-stage stage-pad">
        <p className="ch-note">This DFA accepts: {example.language}.</p>
        <SectionTitle>The machine as written</SectionTitle>
        <WideRegion minWidth={GRAPH_W} label="DFA diagram: scroll sideways to see all of it">
          <GraphView
            nodes={toNodes(dfa, at)}
            edges={toEdges(dfa)}
            directed
            startNode={dfa.start}
            width={GRAPH_W}
            height={GRAPH_H}
            radius={22}
            labelHalo
            className="ch-graph"
            ariaLabel={`DFA with ${dfa.states.length} states${partition ? ` in ${partition.count} classes` : ''}`}
            nodeMark={(id) => (picked.includes(id) ? { tone: 'hi', fill: 'solid' } : merged.includes(id) ? { tone: 'violet', fill: 'solid' } : partition ? { tone: plainTone(partition.classOf[id]), fill: 'tint' } : null)}
            onNodeClick={pick}
            nodeAriaLabel={(id) => `State ${id}${partition ? `, class ${partition.classOf[id] + 1}` : ''}`}
          />
        </WideRegion>
        {partition ? (
          <p className="ch-note">
            Round {round}:{' '}
            {Array.from({ length: partition.count }, (_, k) => (
              <span key={k} className="ch-class" style={{ borderColor: toneVar(plainTone(k)) }}>
                {'{'}
                {dfa.states.filter((s) => partition.classOf[s] === k).join(', ')}
                {'}'}
              </span>
            ))}
          </p>
        ) : null}
        {small && smallAt ? (
          <>
            <SectionTitle>The smallest DFA: one state per class</SectionTitle>
            <WideRegion minWidth={GRAPH_W} label="Minimal DFA: scroll sideways to see all of it">
              <GraphView
                nodes={toNodes(small, smallAt)}
                edges={toEdges(small)}
                directed
                startNode={small.start}
                width={GRAPH_W}
                height={GRAPH_H}
                radius={26}
                labelHalo
                className="ch-graph"
                ariaLabel={`Smallest DFA with ${small.states.length} states`}
                nodeMark={() => ({ tone: 'violet', fill: 'tint' })}
              />
            </WideRegion>
          </>
        ) : null}
        <SectionTitle>Why a^n b^n is not regular: its prefixes never stop being different</SectionTitle>
        <table className="data-table ch-growth">
          <thead>
            <tr>
              <th>Prefixes</th>
              <th>Different behaviours</th>
            </tr>
          </thead>
          <tbody>
            {growth.map((g) => (
              <tr key={g.k}>
                <td>a^0 to a^{g.k}</td>
                <td>{g.classes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ch-note">Two prefixes behave alike when no suffix (the table below tries suffixes up to one longer than the prefixes) separates them; a^i and a^j differ because b^i finishes only one of them. A DFA needs one state per behaviour, and the count keeps growing with every prefix added (the Myhill-Nerode view).</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">small machines built for this page; minimisation is partition refinement, checked against a brute-force count of behaviours</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

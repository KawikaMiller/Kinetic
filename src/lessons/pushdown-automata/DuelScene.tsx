import { useMemo, useState, type ReactNode } from 'react';
import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { accepts, type State } from '../../core/automata';
import { duelCaption } from './captions';
import { DEAD, MAX_K, MAX_N, MIN_K, boundedCounter, duel, pdaAccepts, pigeonhole, placeCounter, wordAnBn } from './duel';
import { OPENING } from './opening';

const GAP = 56;
const TOP = 44;
const BOTTOM = 126;
const HEIGHT = 170;

/** Scene 2: a DFA that counts to k, against a PDA that counts without a limit. */
export function DuelScene({ picker }: { picker: ReactNode }) {
  const [k, setK] = useState(OPENING.duel.k);
  const [n, setN] = useState(OPENING.duel.n);
  const dfa = useMemo(() => boundedCounter(k), [k]);
  const at = useMemo(() => placeCounter(k, GAP, TOP, BOTTOM), [k]);
  const result = useMemo(() => duel(k, n), [k, n]);
  const pigeon = useMemo(() => pigeonhole(dfa), [dfa]);
  const end = result.path[result.path.length - 1] as State;
  const width = GAP * (k + 3);

  const nodes: GraphNode<State>[] = dfa.states.map((s) => ({ id: s, at: at[s], accept: dfa.accept.includes(s), label: s === DEAD ? '✕' : s }));
  const edges: GraphEdge<State>[] = dfa.states.flatMap((from) =>
    ['a', 'b'].flatMap((sym) => {
      const to = dfa.delta[from][sym];
      return to === DEAD ? [] : [{ from, to, label: sym }];
    }),
  );
  const visited = new Set(result.path as State[]);
  const w1 = wordAnBn(pigeon.i);
  const w2 = 'a'.repeat(pigeon.j) + 'b'.repeat(pigeon.i);

  return (
    <StageFrame
      height={420}
      intro={duelCaption({ k, n, result, states: dfa.states.length })}
      introKey={`${k}|${n}`}
      stats={
        <Stats>
          <Stat label="DFA states" value={dfa.states.length} color="var(--info)" sub={`2 x ${k} + 2, including the dead state`} />
          <Stat label="DFA" value={result.dfaAccepts ? 'accepts' : 'rejects'} color={result.dfaAccepts ? 'var(--ok)' : 'var(--bad)'} sub={`the word a^${n} b^${n}`} />
          <Stat label="PDA" value={result.pdaAccepts ? 'accepts' : 'rejects'} color={result.pdaAccepts ? 'var(--ok)' : 'var(--bad)'} sub="one stack, no limit" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'state the word ends in', shape: 'dot' },
            { color: 'var(--info)', label: 'state the word passed through', shape: 'dot' },
            { color: 'var(--bad)', label: 'dead state', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Counter limit k" value={k} min={MIN_K} max={MAX_K} onChange={setK} />
          <Slider label="n (the word is a^n b^n)" value={n} min={0} max={MAX_N} onChange={setN} />
        </>,
      ]}
    >
      <div className="pd-stage stage-pad">
        <SectionTitle>A DFA for {'{'}a^n b^n : n up to {k}{'}'}: a counter up, a counter down</SectionTitle>
        <WideRegion minWidth={Math.max(380, width)} label="DFA diagram: scroll sideways to see all of it">
          <GraphView
            nodes={nodes}
            edges={edges}
            directed
            startNode={dfa.start}
            width={width}
            height={HEIGHT}
            radius={20}
            labelHalo
            className="pd-graph"
            ariaLabel={`DFA with ${dfa.states.length} states for a^n b^n up to n = ${k}; the word a^${n} b^${n} ends in ${end}`}
            nodeMark={(id) => (id === end ? { tone: id === DEAD ? 'bad' : 'hi', fill: 'solid' } : id === DEAD ? { tone: 'bad', fill: 'tint' } : visited.has(id) ? { tone: 'info', fill: 'tint' } : null)}
          />
        </WideRegion>
        <p className="pd-note">
          Every arrow not drawn goes to the dead state <code>✕</code>, which never leaves. The counters stop at {k}: a word with more a's has nowhere to go.
        </p>
        <p className="pd-note">
          The pigeonhole step, from these numbers: reading <code>a</code> {dfa.states.length} times in a row visits {dfa.states.length + 1} states in a machine of {dfa.states.length} states, so the visits after {pigeon.i} and {pigeon.j} a's share the state <code>{pigeon.state}</code>. The machine cannot tell <code>a^{pigeon.i} b^{pigeon.i}</code> from <code>a^{pigeon.j} b^{pigeon.i}</code>: it gives {accepts(dfa, w1) ? 'accept' : 'reject'} to both, while the PDA gives {pdaAccepts(w1) ? 'accept' : 'reject'} and {pdaAccepts(w2) ? 'accept' : 'reject'}.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">machines built for this page: the DFA is generated from k, the PDA is the a^n b^n machine</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}


import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { ROOT, allLinks, bfsOrder, clickTarget, nextToAssign, type Assigned } from './model';
import { PatternEditor } from './PatternEditor';
import type { LinkMark } from './links';
import { TrieGraph } from './TrieGraph';
import { usePatterns } from './usePatterns';

const NOTHING: Assigned = {};

interface Progress {
  /** The pattern list these links belong to: a different list starts again. */
  key: string;
  links: Assigned;
  message: string | null;
  ok: boolean;
}

/** Scene 2: the learner assigns each failure link in breadth-first order by clicking a state; wrong targets are refused with the reason. */
export function LinksScene({ picker }: { picker: ReactNode }) {
  const state = usePatterns();
  const { machine, patterns } = state;
  const key = patterns.join();
  const [progress, setProgress] = useState<Progress>({ key, links: NOTHING, message: null, ok: true });
  const current = progress.key === key ? progress : { key, links: NOTHING, message: null, ok: true };
  const { links } = current;
  const order = useMemo(() => bfsOrder(machine.trie).slice(1), [machine]);
  const next = nextToAssign(machine, links);
  const done = order.filter((id) => links[id] !== undefined).length;
  const states = machine.trie.states;
  const name = (id: number) => (id === ROOT ? 'the root' : `'${states[id].string}' (state ${id})`);

  const shown: LinkMark[] = order.filter((id) => links[id] !== undefined && links[id] !== ROOT).map((id) => ({ from: id, to: links[id], tone: 'violet' }));
  const prompt = order.length === 0 ? 'There is only the root: add a pattern to get failure links to set.' : next === undefined ? 'Every failure link is set; the output links are in the table.' : `Click the state that the failure link of ${name(next)} points to.`;

  const click = (target: number) => {
    const result = clickTarget(machine, links, target);
    if (result) setProgress({ key, links: result.assigned, message: result.message, ok: result.ok });
  };
  const reveal = () => setProgress({ key, links: allLinks(machine), message: 'Revealed: every failure link, as the construction computes it.', ok: true });
  const reset = () => setProgress({ key, links: NOTHING, message: null, ok: true });

  return (
    <StageFrame
      height={460}
      intro={<>{current.message ? `${current.message} ` : ''}{prompt}</>}
      introKey={`links|${key}|${done}|${current.message ?? ''}`}
      stats={
        <Stats>
          <Stat label="Links set" value={`${done} of ${order.length}`} color="var(--violet)" sub="breadth-first, shallow states first" />
          <Stat label="Next state" value={next === undefined ? 'none' : `${next}`} color="var(--hi)" sub={next === undefined ? 'all set' : `'${states[next].string}'`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the state whose link is next', shape: 'square' },
            { color: 'var(--violet)', label: 'a failure link you set (links to the root are not drawn)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PatternEditor state={state} note="Editing the patterns starts the links again." />
        </>,
        <>
          <Button softDisabled={next === undefined} onClick={reveal}>Reveal the rest</Button>
          <Button onClick={reset}>Reset links</Button>
          <Hint tone={current.ok ? 'muted' : 'bad'}>
            <span role="status">{current.message ?? 'Pick the longest proper suffix of the state that is also a prefix of some pattern.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="ac-stage stage-pad">
        <TrieGraph
          machine={machine}
          links={shown}
          nodeMark={(id) => (id === next ? { tone: 'hi', fill: 'solid' } : null)}
          reveal={next === undefined ? undefined : [next]}
          onNodeClick={next === undefined ? undefined : click}
          ariaLabel="The trie: click the state a failure link should point to"
        />
        <table className="ac-table">
          <caption className="ac-caption">Failure and output links, in breadth-first order</caption>
          <thead>
            <tr><th scope="col">state</th><th scope="col">string</th><th scope="col">failure link</th><th scope="col">output link</th></tr>
          </thead>
          <tbody>
            {order.map((id) => {
              const set = links[id] !== undefined;
              const out = machine.out[id];
              return (
                <tr key={id} className={id === next ? 'is-next' : ''}>
                  <td>{id}</td>
                  <td><code>{states[id].string}</code></td>
                  <td>{set ? name(links[id]) : '?'}</td>
                  <td>{set ? (out < 0 ? 'none' : name(out)) : '?'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="ac-note">An output link skips from a state to the nearest state on its failure chain that ends a pattern, so a match nested inside a longer one is found without walking the chain.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: each click is judged against the failure link the construction computes</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

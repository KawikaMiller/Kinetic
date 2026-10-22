import type { ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { plural } from '../../core/format';
import { PatternEditor } from './PatternEditor';
import type { LinkMark } from './links';
import { TrieGraph } from './TrieGraph';
import { usePatterns } from './usePatterns';

const NO_LINKS: readonly LinkMark[] = [];

/** Scene 1: the trie of the patterns, states numbered in insertion order, pattern ends drawn as double outlines. */
export function TrieScene({ picker }: { picker: ReactNode }) {
  const state = usePatterns();
  const { machine, patterns } = state;
  const states = machine.trie.states;
  const letters = patterns.reduce((sum, p) => sum + p.length, 0);
  const ends = states.filter((s) => s.ends >= 0);

  return (
    <StageFrame
      height={420}
      intro={
        <>
          The trie of {plural(patterns.length, 'pattern')} has {plural(states.length, 'state')}: the root plus one per distinct prefix.{patterns.length === 0 && ' Add a pattern to grow it.'}
          States are numbered in the order the patterns insert them, and a double outline marks the end of a pattern.
        </>
      }
      introKey={`trie|${patterns.join()}`}
      stats={
        <Stats>
          <Stat label="States" value={states.length} color="var(--info)" sub="the root and each distinct prefix" />
          <Stat label="Letters in the patterns" value={letters} color="var(--violet)" sub={`${letters - (states.length - 1)} saved by shared prefixes`} />
          <Stat label="Pattern ends" value={ends.length} color="var(--ok)" sub={ends.map((s) => `${s.id} ${s.string}`).join(', ') || 'none'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: 'a double outline: a pattern ends at this state', shape: 'square' },
            { color: 'var(--muted)', label: 'an arrow labelled with the letter of the trie edge', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PatternEditor state={state} />
        </>,
      ]}
    >
      <div className="ac-stage stage-pad">
        <TrieGraph machine={machine} links={NO_LINKS} ariaLabel={`The trie of the patterns ${patterns.join(', ')}`} />
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: the trie is built from the patterns by the code that runs the search</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

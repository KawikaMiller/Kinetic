import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { coverageWord, treeCaption } from './captions';
import { OPENING } from './opening';
import { BEHAVIOUR_NEEDS, LEVELS, NEEDS, REQUEST_LEVEL, SOLUTIONS, behaviourCoverage, cheapestFull, needShare, optionsAt } from './tree';

const COVERAGE_CLASS = { full: 'pt-ok', part: 'pt-violet', none: 'pt-dim' } as const;
const levelOfSolution = REQUEST_LEVEL;

/** Scene 1: walk up an outcomes tree from a request, then compare the options at the level you stopped at. */
export function TreeScene({ picker }: { picker: ReactNode }) {
  const [level, setLevel] = useState(OPENING.tree.level);
  const options = new Set(optionsAt(LEVELS[level].id).map((s) => s.id));
  const best = cheapestFull();
  const request = SOLUTIONS[0];
  const up = level > 0;
  const down = level < REQUEST_LEVEL;

  return (
    <StageFrame
      height={640}
      intro={treeCaption(level)}
      introKey={level}
      stats={
        <Stats>
          <Stat label="You are at" value={LEVELS[level].label} color="var(--hi)" />
          <Stat label="The request" value={`${request.effort} days`} sub={`${request.label}: covers ${BEHAVIOUR_NEEDS.filter((n) => request.covers.includes(n)).length} of ${BEHAVIOUR_NEEDS.length} parts of the behaviour`} />
          <Stat label="Cheapest full cover" value={`${best.effort} days`} color="var(--ok)" sub={best.label} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'where you are now', shape: 'square' },
            { color: 'var(--info)', label: 'the path you walked', shape: 'square' },
            { color: 'var(--ok)', label: 'a solution that covers the behaviour', shape: 'square' },
            { color: 'var(--violet)', label: 'covers part of it', shape: 'square' },
            { color: 'var(--dim)', label: 'misses it', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" softDisabled={!up} onClick={() => setLevel(level - 1)}>{up ? LEVELS[level - 1].question : 'At the top'}</Button>
          <Button softDisabled={!down} onClick={() => setLevel(level + 1)}>Back down one level</Button>
          <Button softDisabled={level === REQUEST_LEVEL} onClick={() => setLevel(REQUEST_LEVEL)}>Back to the request</Button>
        </>,
      ]}
    >
      <div className="pt-stage stage-pad">
        <ol className="pt-chain">
          {LEVELS.slice(0, REQUEST_LEVEL).map((l, i) => (
            <li key={l.id}>
              <button type="button" className={`pt-level ${i === level ? 'pt-now' : i > level ? 'pt-walked' : ''}`} aria-current={i === level ? 'step' : undefined} onClick={() => setLevel(i)}>
                <b>{l.label}</b>
                <span>{l.text}</span>
              </button>
            </li>
          ))}
        </ol>
        <ul className="pt-solutions" aria-label="Solutions under the need">
          {SOLUTIONS.map((s) => (
            <li key={s.id} className={`pt-solution ${COVERAGE_CLASS[behaviourCoverage(s)]} ${options.has(s.id) ? 'pt-offered' : 'pt-quiet'}`}>
              <button type="button" className={`pt-level ${level === levelOfSolution && s.id === request.id ? 'pt-now' : ''}`} onClick={() => setLevel(s.id === request.id ? REQUEST_LEVEL : LEVELS.findIndex((l) => l.id === 'need'))}>
                <b>{s.label}{s.id === request.id ? ' (the request)' : ''}</b>
                <span>{s.effort} days of effort; {coverageWord(s)}</span>
                <span>Needs covered: {Math.round(needShare(s) * 100)}% ({s.covers.map((c) => NEEDS.find((n) => n.id === c)!.label).join('; ')})</span>
              </button>
            </li>
          ))}
        </ul>
        <ProvenanceRow>
          <ClaimLabel kind="practice">working from goal to metric to behaviour to need before choosing a solution is a common outcome-oriented way to plan</ClaimLabel>
          <Provenance kind="invented">the product, the request, the needs and every effort are invented</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

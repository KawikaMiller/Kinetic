import type { ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { useIntroCaption } from '../../core/caption';
import { Button, ClaimLabel, Hint } from '../../components/ui';
import { Box, SectionTitle } from '../../components/Panel';
import { kosaraju, presetById, type PresetId } from './model';
import type { SccEditor } from './useSccEditor';

interface Use {
  title: string;
  line: string;
  claim: 'practice' | 'standard';
  /** The preset that shows it, or none when the use is only named. */
  preset?: PresetId;
}

const USES: Use[] = [
  { title: 'Dependency cycles', line: 'A group of packages or build targets that depend on one another in a loop is one component: it has to be built, versioned or broken up together.', claim: 'practice', preset: 'tangle' },
  { title: 'Deadlock', line: 'In a wait-for graph, a component with more than one task (or a task waiting on itself) is a set of tasks stuck waiting on each other, when each resource has one instance.', claim: 'practice', preset: 'deadlock' },
  { title: '2-SAT', line: 'Deciding whether a set of two-variable clauses can all hold reduces to finding strongly connected components of an implication graph (named here, not shown).', claim: 'standard' },
];

export function WhyScene({ picker, ed, onShow }: { picker: ReactNode; ed: SccEditor; onShow: (preset: PresetId) => void }) {
  useIntroCaption(<>Three places a loop in a directed graph matters. Press Show it to load the matching graph and watch its components get found.</>);
  return (
    <StageFrame
      height={420}
      controls={[<>{picker}</>]}
    >
      <div className="scc-why stage-pad">
        {USES.map((u) => {
          const g = u.preset ? presetById(u.preset).graph : null;
          const comps = g ? kosaraju(g).components : null;
          return (
            <Box key={u.title} className="scc-use">
              <SectionTitle>{u.title}</SectionTitle>
              <p className="scc-line">{u.line}</p>
              <div className="scc-use-row">
                <ClaimLabel kind={u.claim} />
                {u.preset && comps && (
                  <Button onClick={() => { ed.load(u.preset!); onShow(u.preset!); }}>
                    Show it: {comps.length} {comps.length === 1 ? 'component' : 'components'}
                  </Button>
                )}
              </div>
            </Box>
          );
        })}
        <Hint tone="muted" block>
          Related lessons: dependency-management for lockfiles and version conflicts, deadlocks for the four conditions, and topological-sort for ordering a graph with no cycle.
        </Hint>
      </div>
    </StageFrame>
  );
}

import type { ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useIntroCaption } from '../../core/caption';
import { Button, ClaimLabel, Hint } from '../../components/ui';
import type { PresetId } from './model';
import { matchingLine, pipelineLine } from './text';
import type { FlowEditor } from './useFlowEditor';

interface Use {
  title: string;
  line: string;
  preset?: PresetId;
}

export function ModelsScene({ picker, ed, onShow }: { picker: ReactNode; ed: FlowEditor; onShow: () => void }) {
  useIntroCaption(<>Three things that look like flow problems. Press Load to put one on the network and run it with the same buttons.</>);
  const uses: Use[] = [
    { title: 'Bipartite matching', line: 'Give every worker one job: a source feeds each worker, each worker has pipes to the jobs it can do, each job feeds the sink, all with capacity 1. ' + matchingLine(), preset: 'matching' },
    { title: 'Bottlenecks and capacity planning', line: 'The minimum cut names the pipes that limit the whole system. ' + pipelineLine(), preset: 'pipeline' },
    { title: 'Project selection', line: 'Choosing projects with profits and prerequisites reduces to a minimum cut (named here, not shown).' },
  ];
  return (
    <StageFrame height={420} controls={[<>{picker}</>]}>
      <div className="nf-why stage-pad">
        {uses.map((u) => (
          <Box key={u.title} className="nf-use">
            <SectionTitle>{u.title}</SectionTitle>
            <p className="nf-line">{u.line}</p>
            <div className="nf-use-row">
              <ClaimLabel kind="standard" />
              {u.preset && (
                <Button onClick={() => { ed.load(u.preset!); onShow(); }}>Load it on the network</Button>
              )}
            </div>
          </Box>
        ))}
        <Hint tone="muted" block>
          The next lesson, bipartite matching, builds on the first of these. Real flow solvers use faster algorithms than Edmonds-Karp (Dinic and push-relabel are named here, not shown).
        </Hint>
      </div>
    </StageFrame>
  );
}

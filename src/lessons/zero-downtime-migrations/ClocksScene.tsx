import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { ALL_ORDERS, INSTANCES, PANEL_SIZE, STEP_IDS, v2Count } from './model';
import { clocksCaption, correctRuns, deployStarts, troubleAfterStep } from './clocks';
import { CLOCKS_OPEN, STEP_SHORT, cleanCount } from './view';

export function ClocksScene({ picker }: { picker: ReactNode }) {
  const [deploy, setDeploy] = useState<number>(CLOCKS_OPEN.deploy);
  const runs = useMemo(() => correctRuns(deploy), [deploy]);
  const counts = useMemo(() => deployStarts().map((d) => ({ deploy: d, clean: cleanCount(d) })), []);
  const clean = counts.find((c) => c.deploy === deploy)?.clean ?? cleanCount(deploy);
  const trouble = STEP_IDS.reduce((n, _, k) => n + troubleAfterStep(runs, k), 0);
  const caption = clocksCaption(deploy, runs, clean);
  return (
    <StageFrame
      height={460}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Clean orderings at this start" value={`${clean} of ${ALL_ORDERS.length}`} color={clean > 0 ? 'var(--ok)' : 'var(--bad)'} sub={`clean on all ${PANEL_SIZE} request mixes`} />
          <Stat label="Requests failed or stale, correct order" value={trouble} color={trouble > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`over ${PANEL_SIZE} request mixes, steps in the textbook order`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'instances still on v1 when the step runs', shape: 'square' }, { color: 'var(--violet)', label: 'instances on v2', shape: 'square' }, { color: 'var(--bad)', label: 'a count above zero: failed or stale requests followed that step', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Fleet already on v2 at the start" value={deploy} min={0} max={100} step={10} onChange={setDeploy} format={(v) => `${v}%`} />
        </>,
      ]}
    >
      <div className="zdm-stage stage-pad">
        <Box>
          <SectionTitle hint="two clocks: the rolling deploy and the migration">The textbook order, step by step</SectionTitle>
          <table className="zdm-table table-cards">
            <thead><tr><th scope="col">Step</th><th scope="col">Instances on v1 as it runs</th><th scope="col">Requests that failed or went stale, over {PANEL_SIZE} request mixes</th></tr></thead>
            <tbody>
              {STEP_IDS.map((id, k) => {
                const v2 = v2Count(deploy, k);
                const bad = troubleAfterStep(runs, k);
                return (
                  <tr key={id}>
                    <td data-label="Step">{STEP_SHORT[id]}</td>
                    <td data-label="Instances on v1 as it runs"><span className="zdm-v1">{INSTANCES - v2} on v1</span>, <span className="zdm-v2">{v2} on v2</span></td>
                    <td data-label="Requests that failed or went stale, over all request mixes" className={bad > 0 ? 'zdm-bad' : undefined}>{bad}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Hint tone="muted" block>The steps are only safe once the fleet has caught up with them. Each step also upgrades a fifth of the fleet, which stands for the deploy carrying on.</Hint>
        </Box>
        <Box>
          <SectionTitle hint={`every one of the 720 orderings, run for each start on ${PANEL_SIZE} request mixes`}>How many orderings are clean</SectionTitle>
          <table className="zdm-table table-cards">
            <thead><tr><th scope="col">Fleet on v2 at the start</th><th scope="col">Clean orderings</th></tr></thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.deploy}>
                  <td data-label="Fleet on v2 at the start">{c.deploy}%</td>
                  <td data-label="Clean orderings" className={c.clean > 0 ? 'zdm-ok' : 'zdm-bad'}>{c.clean} of {ALL_ORDERS.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">counted by running all 720 orderings of the toy migration on request mixes (seeds) 0 to {PANEL_SIZE - 1}; an ordering counts as clean only if every one of them runs clean; requests simulated</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

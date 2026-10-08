import { ChipButton, ControlGroup, Slider } from '../../components/ui';
import { LEAKS, LEAK_IDS } from './model';
import type { RunState } from './useRunState';

const RPS_MIN = 20;
const RPS_MAX = 600;
const RPS_STEP = 10;

/** The leaky workload toggles and the traffic that drives them. */
export function LeakControls({ run }: { run: RunState }) {
  return (
    <>
      <ControlGroup label="Leaks" inline>
        {LEAK_IDS.map((id) => (
          <ChipButton key={id} tone="info" on={run.load.leaks.has(id)} onStyle="solid" onClick={() => run.toggleLeak(id)}>
            {LEAKS[id].label}
          </ChipButton>
        ))}
      </ControlGroup>
      <Slider label="Traffic" value={run.load.rps} min={RPS_MIN} max={RPS_MAX} step={RPS_STEP} onChange={run.setRps} format={(v) => `${v} req/s`} />
    </>
  );
}

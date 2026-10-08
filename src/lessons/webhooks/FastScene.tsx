import { useMemo, useState, type ReactNode } from 'react';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { FAST_ACTORS, fastFrames, fastLadder, type FastFrame } from './frames';
import { PROVIDER_TIMEOUT_S, fastScript, type ReplyMode } from './model';

const STEP_MS = 1500;
const DEFAULT_WORK_S = 20;
const MAX_WORK_S = 30;
const HONEST = `Simulated provider and receiver; the ${PROVIDER_TIMEOUT_S} s timeout is illustrative (providers allow anywhere from a few seconds to tens of seconds).`;

export function FastScene({ picker }: { picker: ReactNode }) {
  const [workS, setWorkS] = useState(DEFAULT_WORK_S);
  const [ackFirst, setAckFirst] = useState(false);
  const mode: ReplyMode = ackFirst ? 'ack-first' : 'after-work';
  const run = useMemo(() => fastScript(workS, mode), [workS, mode]);
  const intro = useMemo(
    () => <>The handler needs {workS} s of work (a PDF, an email, a database job). The endpoint {ackFirst ? 'stores the event and replies first, working from its own queue' : 'does the work first and replies after'}; the provider waits {PROVIDER_TIMEOUT_S} s. Press play.</>,
    [workS, ackFirst],
  );
  const frames = useMemo(() => fastFrames(run, workS, intro), [run, workS, intro]);
  const player = usePlayer<FastFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const at = player.frame.at;
  const now = at < 0 ? null : run.steps[Math.min(at, run.steps.length - 1)];
  const messages = useMemo(() => fastLadder(run), [run]);

  return (
    <StageFrame
      player={player}
      height={520}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'delivery' }, { color: 'var(--orange)', label: 'retry attempt' }, { color: 'var(--violet)', label: 'internal queue' },
        { color: 'var(--ok)', label: '2xx the provider counts' }, { color: 'var(--bad)', label: 'reply lost (timeout) / repeated work' },
      ]} />}
      controls={[<>
        {picker}
        <Toggle label="Reply" value={ackFirst} onChange={setAckFirst} off="After the work" on="Ack first, work later" />
        <Slider label="The work takes" value={workS} min={1} max={MAX_WORK_S} onChange={setWorkS} format={(s) => `${s} s`} />
      </>]}
    >
      <div className="stage-pad wh">
        <SequenceDiagram actors={FAST_ACTORS} messages={messages} step={Math.min(at, run.steps.length)} ariaLabel="Webhook delivery and handler timing" />
        <div className="wh-stats">
          <Stat label="Times the work has run" value={now?.workRuns ?? 0} color={now && now.workRuns > 1 ? 'var(--bad)' : undefined} />
          <Stat label="Provider has a 2xx" value={now?.acked ? 'yes' : 'no'} color={now?.acked ? 'var(--ok)' : undefined} />
        </div>
        <Hint block>
          {HONEST} If the endpoint cancels the work when the provider hangs up, the repeats cost less, but the event is still retried. Replying 2xx first moves the risk: if your own queue
          or worker fails after the ack, the provider won't resend, so store the event durably before replying, and let the worker be idempotent (at-least-once, scene 3).
        </Hint>
      </div>
    </StageFrame>
  );
}

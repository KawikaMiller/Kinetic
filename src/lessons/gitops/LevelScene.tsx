import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { scriptCaption } from './captions';
import { ClusterView } from './ClusterView';
import { PullPushDiagram } from './PullPushDiagram';
import { DOWN_FROM, DOWN_UNTIL, runScript, verdict, type Handler } from './script';

const STEP_MS = 700;

export function LevelScene({ picker }: { picker: ReactNode }) {
  const [handler, setHandler] = useState<Handler>('edge');
  const [restart, setRestart] = useState(true);
  const [prune, setPrune] = useState(true);
  const frames = useMemo(() => runScript({ handler, restart, prune }).map((f) => ({ ...f, say: scriptCaption(f, handler), quiet: true })), [handler, restart, prune]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const v = verdict(f.desired, f.live);

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Controller" value={f.down ? 'down' : 'running'} color={f.down ? 'var(--bad)' : 'var(--ok)'} sub={restart ? `restarts: down from second ${DOWN_FROM} to ${DOWN_UNTIL - 1}` : 'never down'} />
          <Stat label="Live equals git" value={v.matches && !v.orphans.length ? 'yes' : 'no'} color={v.matches && !v.orphans.length ? 'var(--ok)' : 'var(--bad)'} sub={v.wrong.length ? `wrong: ${v.wrong.join(', ')}` : v.orphans.length ? `orphan: ${v.orphans.join(', ')}` : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'git: the desired state', shape: 'square' },
            { color: 'var(--ok)', label: 'live, in sync', shape: 'square' },
            { color: 'var(--bad)', label: 'live, wrong', shape: 'square' },
            { color: 'var(--orange)', label: 'an orphan', shape: 'square' },
            { color: 'var(--dim)', label: 'does not exist', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Controller" value={handler} onChange={setHandler} options={[{ value: 'edge', label: 'Edge-triggered' }, { value: 'level', label: 'Level-triggered' }]} />
          <Toggle label="Controller restarts and misses events" value={restart} onChange={setRestart} off="No" on="Yes" />
          <Toggle label="Prune" value={prune} onChange={setPrune} off="Off" on="On" />
        </>,
      ]}
    >
      <div className="go stage-pad">
        <ClusterView desired={f.desired} live={f.live} acting={null} paused={false} />
        <Box variant="sunken">
          <SectionTitle hint="what happens at this second">Events</SectionTitle>
          <p className="go-notes">{f.notes.length ? f.notes.join('. ') : 'Nothing happens.'}</p>
        </Box>
        {handler === 'edge' && (
          <Hint block>
            This edge-triggered handler is built with no periodic resync, and that is the whole result: it acts only on the events it sees, so one it misses is gone. Many real controllers add a periodic resync to an event handler, which makes them level-triggered in effect.
          </Hint>
        )}
        <Box>
          <SectionTitle hint="two boxes, and where the credentials usually live">Pull vs push</SectionTitle>
          <PullPushDiagram />
        </Box>
        <ProvenanceRow>
          <Provenance kind="scripted">the same three events every run; only the controller’s reaction changes</Provenance>
          <Provenance kind="toy">a toy controller, not Kubernetes</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

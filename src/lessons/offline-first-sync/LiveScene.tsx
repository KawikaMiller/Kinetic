import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { liveIntro } from './captions';
import { airplaneWindows, initialLive, liveAdd, liveEdit, liveRename, liveWait, setDraft, toggleAirplane } from './init';
import { LIVE_STEP_MS, liveConfig } from './scenarios';
import { MAX_TITLE, DEVICES, type DeviceId } from './ops';
import { ReplicaCard } from './ReplicaCard';
import { runConfig } from './runs';
import { countMarks, itemMark } from './status';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'pending: made on the device, not sent yet' },
      { color: 'var(--info)', label: 'in flight: sent, not acknowledged' },
      { color: 'var(--ok)', label: 'confirmed by the server' },
      { color: 'var(--orange)', label: 'a conflict kept for the user' },
      { color: 'var(--bad)', label: 'rolled back by the server' },
      { color: 'var(--dim)', label: 'a deleted item (tombstone), or a device in airplane mode' },
    ]}
  />
);
const NAMES: Record<DeviceId, string> = { phone: 'Phone', laptop: 'Laptop' };

export function LiveScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialLive);
  const run = useMemo(() => runConfig(liveConfig(st.script, airplaneWindows(st)), st.clock), [st]);
  const devices = { phone: run.phone, laptop: run.laptop };
  const waiting = countMarks(run.phone).pending + countMarks(run.laptop).pending;
  const offline = (d: DeviceId) => st.open[d] !== null;

  return (
    <StageFrame
      height={620}
      legend={LEGEND}
      intro={liveIntro(run)}
      introKey={`${st.clock}|${st.script.length}|${st.closed.length}|${st.open.phone}|${st.open.laptop}`}
      stats={
        <Stats>
          <Stat label="Replicas equal" value={run.converged ? 'yes' : 'not yet'} color={run.converged ? 'var(--ok)' : 'var(--orange)'} sub="phone, laptop and server" />
          <Stat label="Edits pending" value={waiting} color={waiting > 0 ? 'var(--hi)' : undefined} sub="made, but not sent" />
          <Stat label="Conflicts listed" value={run.views.server.conflicts.length} color={run.views.server.conflicts.length > 0 ? 'var(--orange)' : undefined} sub="kept for the user" />
          <Stat label="Server holds" value={run.server.log.length} sub={`operations, at ${(st.clock / 1000).toFixed(1)} s`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setSt((s) => liveWait(s))}>Wait 3 s</Button>
          <Button onClick={() => setSt(initialLive())}>Reset</Button>
          <Hint tone="muted">
            <span role="status">{st.note ?? `Each press moves time on by ${LIVE_STEP_MS} ms. "rename" uses the Title field: a blank one is sent anyway, and the server refuses it.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="ofs-stage stage-pad">
        <div className="ofs-devices">
          {DEVICES.map((d) => {
            const dev = devices[d];
            return (
              <ReplicaCard
                key={d}
                name={NAMES[d]}
                view={run.views[d]}
                offline={offline(d)}
                mark={(id) => itemMark(dev, id)}
                rolledBack={dev.notices}
                actions={(_, pick) => (
                  <>
                    <ChipButton tone="info" onClick={() => setSt((s) => liveRename(s, d, pick))}>rename</ChipButton>
                    <ChipButton tone="info" onClick={() => setSt((s) => liveEdit(s, d, { kind: 'tick', pick }))}>tick</ChipButton>
                    <ChipButton tone="bad" onClick={() => setSt((s) => liveEdit(s, d, { kind: 'delete', pick }))}>delete</ChipButton>
                  </>
                )}
              >
                <div className="ofs-card-controls">
                  <Toggle label="Network" value={offline(d)} off="online" on="airplane mode" onChange={() => setSt((s) => toggleAirplane(s, d))} />
                  <TextField ariaLabel={`${NAMES[d]} title`} label="Title" value={st.drafts[d]} onChange={(t) => setSt((s) => setDraft(s, d, t))} onEnter={() => setSt((s) => liveAdd(s, d))} width={150} maxLength={MAX_TITLE} placeholder="up to 40 characters" spellCheck={false} />
                  <Button onClick={() => setSt((s) => liveAdd(s, d))}>Add item</Button>
                  <Button onClick={() => setSt((s) => liveEdit(s, d, { kind: 'inc' }))}>+1 counter</Button>
                </div>
              </ReplicaCard>
            );
          })}
        </div>
        <ReplicaCard name="Server (the order of record)" view={run.views.server} />
        <ProvenanceRow>
          <Provenance kind="simulated">two devices and a server on the distributed-sim harness; every edit and message is a simulated event</Provenance>
          <Provenance kind="toy">a replicated list with an operation log, not Automerge or Yjs (named only)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

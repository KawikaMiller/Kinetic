import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { barsAt } from '../../core/gantt';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { migrateFrames, msText } from './captions';
import { initialMigrate, type MigrateState } from './init';
import { SWITCH_AT_MS, UDP_BLOCKED_WAIT_MS, recover, type Phase } from './migration';
import { WideRegion } from '../../components/WideRegion';
import { NetControls } from './NetControls';

/** Narrowest width at which the axis labels and the switch marker stay apart. */
const GANTT_MIN_WIDTH = 480;
const LANES = [
  { id: 'tcp', label: 'TCP + TLS' },
  { id: 'quic', label: 'QUIC' },
];
const TONE: Record<Phase['kind'], Tone> = { transfer: 'sky', dead: 'bad', handshake: 'info', validate: 'ok', wait: 'amber' };

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--sky)', label: 'data flowing' },
      { color: 'var(--bad)', label: 'a TCP connection that is dead (dashed)' },
      { color: 'var(--info)', label: 'a new handshake, and asking again' },
      { color: 'var(--ok)', label: "QUIC's validated new path" },
      { color: 'var(--amber)', label: 'QUIC waiting on a blocked UDP path (hatched)' },
    ]}
  />
);

const barsOfPhases = (lane: string, phases: readonly Phase[]): GanttBar[] =>
  phases.map((p) => ({ id: `${lane}-${p.id}`, lane, start: p.start, end: p.end, tone: TONE[p.kind], kind: p.kind === 'dead' ? 'blocked' : p.kind === 'wait' ? 'wait' : 'work' }));

export function MigrateScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<MigrateState>(initialMigrate);
  const tcp = useMemo(() => recover('tcp', st.rttMs, st.udpBlocked), [st]);
  const quic = useMemo(() => recover('quic', st.rttMs, st.udpBlocked), [st]);
  const frames = useMemo(() => migrateFrames(st), [st]);
  const player = usePlayer(frames, { interval: 160, autoplay: true });
  const now = player.frame.now;
  const end = SWITCH_AT_MS + Math.max(tcp.stallMs, quic.stallMs) + SWITCH_AT_MS;
  const bars = useMemo(() => [...barsOfPhases('tcp', tcp.phases), ...barsOfPhases('quic', quic.phases)], [tcp, quic]);

  return (
    <StageFrame
      height={520}
      player={player}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="TCP stalled" value={msText(tcp.stallMs)} color="var(--bad)" sub={tcp.parts.map((p) => `${p.label}: ${msText(p.ms)}`)} />
          <Stat
            label="QUIC stalled"
            value={msText(quic.stallMs)}
            color={st.udpBlocked ? 'var(--bad)' : 'var(--ok)'}
            sub={quic.parts.map((p) => `${p.label}: ${msText(p.ms)}`)}
          />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="The new network" value={st.udpBlocked} off="passes UDP" on={`blocks UDP (QUIC waits ${msText(UDP_BLOCKED_WAIT_MS)}, then TCP)`} onChange={(udpBlocked) => setSt((s) => ({ ...s, udpBlocked }))} />
        </>,
        <NetControls key="net" rttMs={st.rttMs} onRtt={(rttMs) => setSt((s) => ({ ...s, rttMs }))} />,
        <Button key="reset" onClick={() => setSt(initialMigrate())}>
          Reset
        </Button>,
      ]}
    >
      <div className="qc-stage stage-pad">
        <Box>
          <SectionTitle hint={`the phone changes network ${msText(SWITCH_AT_MS)} in; both stacks see a ${msText(st.rttMs)} round trip`}>A transfer across a network change</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Transfer over TCP and QUIC: scroll sideways to see all of it">
            <GanttLanes lanes={LANES} bars={barsAt(bars, now)} domain={[0, end]} now={now} markers={[{ at: SWITCH_AT_MS, label: 'new address', tone: 'violet' }]} unit=" ms" axis size="md" labelWidth={80} ariaLabel="A transfer over TCP and over QUIC when the phone changes network" />
          </WideRegion>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">recovery built from the same flight counts and round trip as the first scene</Provenance>
          <Provenance kind="illustrative">the 1 s timeout before an app notices a dead TCP connection and the 300 ms wait on a blocked UDP path are made up; real stacks vary</Provenance>
          <Provenance kind="from-memory">PATH_CHALLENGE and PATH_RESPONSE are QUIC's path validation (RFC 9000); browsers typically fall back to TCP when UDP is blocked: verify</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

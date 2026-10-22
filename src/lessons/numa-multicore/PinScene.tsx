import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { decimal, pct } from '../../core/format';
import { TwoSockets } from './Machine';
import { LOCAL_NS, PATTERN_OPTIONS, REMOTE_NS, THREADS, defaultMachine, latency, latencyFormula, nsText, sharedDataNote, type Machine, type Node, type Pattern } from './numa';
import { ModelNotes, NumaLegend } from './Notes';


const SOCKET_OPTIONS = [{ value: 0 as Node, label: 'socket 0' }, { value: 1 as Node, label: 'socket 1' }];
const PLOT_WIDTH = 356;
const CURVE_ENDS: [number, number][] = [[0, LOCAL_NS], [1, REMOTE_NS]];

/** Scene 1: pin threads to sockets and pages to nodes, and read the mean latency the placement gives. */
export function PinScene({ picker }: { picker: ReactNode }) {
  const [machine, setMachine] = useState<Machine>(defaultMachine);
  const [pattern, setPattern] = useState<Pattern>('own');
  const lat = useMemo(() => latency(machine, pattern), [machine, pattern]);
  const togglePage = (page: number) => setMachine({ ...machine, homes: machine.homes.map((h, p) => (p === page ? ((1 - h) as Node) : h)) });
  const setSocket = (t: number, s: Node) => setMachine({ ...machine, sockets: machine.sockets.map((x, i) => (i === t ? s : x)) });
  const point = useMemo(() => [{ x: lat.remoteShare, y: lat.mean, tone: 'hi' as const }], [lat]);

  return (
    <StageFrame
      height={620}
      intro={`${pattern === 'all' ? `${sharedDataNote(machine.sockets)} ` : ''}Mean latency ${nsText(lat.mean)}, ${pct(lat.remoteShare)} of accesses remote, ${decimal(lat.slowdown, 3)}x the all-local ${nsText(LOCAL_NS)}.`}
      introKey={`pin|${pattern}|${machine.sockets.join('')}|${machine.homes.join('')}`}
      legend={<NumaLegend />}
      stats={
        <Stats>
          <Stat label="Mean latency" value={nsText(lat.mean)} color={lat.remoteShare === 0 ? 'var(--ok)' : 'var(--bad)'} sub={`illustrative: local ${LOCAL_NS} ns, remote ${REMOTE_NS} ns`} />
          <Stat label="Remote share" value={pct(lat.remoteShare)} color={lat.remoteShare === 0 ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Slowdown" value={`${decimal(lat.slowdown, 3)}x`} sub="against all-local" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Access pattern" value={pattern} onChange={setPattern} options={PATTERN_OPTIONS} />
          <Button onClick={() => { setMachine(defaultMachine()); setPattern('own'); }}>Reset</Button>
        </>,
        <>
          {machine.sockets.map((s, t) => <Segmented key={t} label={`T${t}`} value={s} onChange={(v) => setSocket(t, v)} options={SOCKET_OPTIONS} />)}
        </>,
      ]}
    >
      <div className="numa-stage stage-pad">
        <Box>
          <SectionTitle hint={`${THREADS} threads, 8 pages: press a page to move it to the other node`}>Threads and pages</SectionTitle>
          <TwoSockets machine={machine} latency={lat} onTogglePage={togglePage} />
          <Hint block tone="faint">{pattern === 'own' ? 'Own pages: thread i uses P(2i) and P(2i+1) equally.' : pattern === 'hot' ? 'One hot page: every thread reads P0.' : 'Everyone reads everything: each thread spreads its reads equally over the 8 pages.'} {latencyFormula()}</Hint>
        </Box>
        <Box>
          <SectionTitle hint="mean latency against the share of accesses that are remote">The cost of a remote share</SectionTitle>
          <Plot2D x={{ domain: [0, 1], label: 'remote share' }} y={{ domain: [LOCAL_NS - 10, REMOTE_NS + 10], label: 'mean latency (ns)' }} width={PLOT_WIDTH} ariaLabel="Mean latency rises in a straight line from the local latency to the remote latency as the remote share grows; the current placement is marked">
            <Curve points={CURVE_ENDS} tone="info" />
            <Points data={point} />
          </Plot2D>
        </Box>
        <ModelNotes />
        <ProvenanceRow>
          <Provenance kind="illustrative">named constants, not any machine: LOCAL_NS = {LOCAL_NS}, REMOTE_NS = {REMOTE_NS}; no real machine was measured</Provenance>
          <Provenance kind="from-memory">remote access is often cited as roughly one and a half to two times local latency; verify against vendor documentation and a published latency measurement</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

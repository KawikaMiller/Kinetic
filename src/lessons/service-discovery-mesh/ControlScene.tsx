import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { controlCaption, minText } from './captions';
import { initialControl, type ControlUi } from './init';
import { HORIZON_MIN, LIFETIME_RANGE, NEW_INSTANCE_MIN, OUTAGE_RANGE, WORKLOADS, actualEndpoints, certTimeline, failingAt, knownEndpoints } from './mesh';

const GANTT_MIN_WIDTH = 560;

export function ControlScene({ picker }: { picker: ReactNode }) {
  const [u, setU] = useState<ControlUi>(initialControl);
  const outage = useMemo(() => ({ start: u.startMin, length: u.lengthMin }), [u.startMin, u.lengthMin]);
  const certs = useMemo(() => certTimeline(u.lifetimeMin, outage), [u.lifetimeMin, outage]);
  const failing = failingAt(certs, u.nowMin);
  const set = (patch: Partial<ControlUi>) => setU((x) => ({ ...x, ...patch }));
  useIntroCaption(controlCaption(outage, certs, u.nowMin), [JSON.stringify(u)]);

  const bars = useMemo<GanttBar[]>(() => {
    const out: GanttBar[] = [];
    if (u.lengthMin > 0) out.push({ id: 'cp', lane: 'cp', start: u.startMin, end: Math.min(HORIZON_MIN, u.startMin + u.lengthMin), tone: 'orange', label: 'control plane away' });
    certs.certs.forEach((c, i) => out.push({ id: `c${i}`, lane: c.workload, start: c.issuedAt, end: Math.min(c.expiresAt, HORIZON_MIN), tone: 'violet', label: 'cert' }));
    certs.gaps.forEach((g, i) => out.push({ id: `g${i}`, lane: g.workload, start: g.from, end: Math.min(g.to, HORIZON_MIN), tone: 'bad', label: 'expired' }));
    return out;
  }, [certs, u.startMin, u.lengthMin]);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Endpoints the proxies know" value={knownEndpoints(outage, u.nowMin)} sub={[`${actualEndpoints(u.nowMin)} exist; a new instance appears at minute ${NEW_INSTANCE_MIN}`]} color={knownEndpoints(outage, u.nowMin) < actualEndpoints(u.nowMin) ? 'var(--orange)' : undefined} />
          <Stat label="Workloads with an expired certificate" value={failing.length} color={failing.length ? 'var(--bad)' : 'var(--ok)'} sub={[failing.length ? failing.join(', ') : 'all calls work']} />
          <Stat label="Renewals that stalled" value={certs.stalled.length} sub={['due while the control plane was away']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'the control plane is away' },
            { color: 'var(--violet)', label: 'a valid certificate' },
            { color: 'var(--bad)', label: 'an expired certificate: calls fail' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setU(initialControl())}>Reset</Button>
        </>,
        <>
          <Slider label="Outage starts" value={u.startMin} min={OUTAGE_RANGE.startMin} max={OUTAGE_RANGE.startMax} step={15} format={(v) => `minute ${v}`} onChange={(startMin) => set({ startMin })} />
          <Slider label="Outage lasts" value={u.lengthMin} min={OUTAGE_RANGE.lenMin} max={OUTAGE_RANGE.lenMax} step={OUTAGE_RANGE.lenStep} format={minText} onChange={(lengthMin) => set({ lengthMin })} />
          <Slider label="Certificate lifetime" value={u.lifetimeMin} {...LIFETIME_RANGE} format={minText} onChange={(lifetimeMin) => set({ lifetimeMin })} />
          <Slider label="Minute shown" value={u.nowMin} min={0} max={HORIZON_MIN - 1} step={5} format={(v) => `minute ${v}`} onChange={(nowMin) => set({ nowMin })} />
        </>,
      ]}
    >
      <div className="sd-stage stage-pad">
        <Box>
          <SectionTitle hint="the data plane keeps running on its last configuration">When the control plane goes down</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Outage timeline: scroll sideways to see all of it">
            <GanttLanes
              lanes={[{ id: 'cp', label: 'control plane' }, ...WORKLOADS.map((w) => ({ id: w, label: w }))]}
              bars={bars}
              domain={[0, HORIZON_MIN]}
              now={u.nowMin}
              unit=" min"
              axis
              size="sm"
              labelWidth={104}
              ariaLabel="The control plane outage and each workload's certificates"
            />
          </WideRegion>
        </Box>
        <Hint tone="muted" block>
          Existing proxies keep running on the last configuration they were given, which is how many meshes describe their failure mode (a fail-static design; behaviour differs by mesh). New instances are not discovered and certificates are not renewed until the control plane returns, so calls fail once a certificate expires.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="not-run">no mesh is installed: this is a model, and products differ</Provenance>
          <Provenance kind="illustrative">the lifetimes, renewal point and outage lengths are made up</Provenance>
          <Provenance kind="from-memory">fail-static behaviour of the data plane; verify per mesh</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

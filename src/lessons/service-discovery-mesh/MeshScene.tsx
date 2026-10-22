import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { integer, pct, sig } from '../../core/format';
import { meshCaption, minText } from './captions';
import { initialMesh, meshActive, type MeshUi } from './init';
import { APP_CALL_MS, CANARY_RANGE, FAIL_RATE_RANGE, HORIZON_MIN, LIFETIME_RANGE, RETRY_RANGE, attempts, callMs, certTimeline, extraHopMs, observedSplit } from './mesh';

const GANTT_MIN_WIDTH = 520;
/** Bars narrower than this drop their label (it stays the tooltip) instead of showing it clipped. */
const GANTT_LABEL_MIN_PX = 72;
const NO_OUTAGE = { start: 0, length: 0 };

export function MeshScene({ picker }: { picker: ReactNode }) {
  const [u, setU] = useState<MeshUi>(initialMesh);
  const active = meshActive(u);
  const set = (patch: Partial<MeshUi>) => setU((x) => ({ ...x, ...patch }));
  const split = useMemo(() => (active.split ? observedSplit(u.seed, u.canaryPct) : null), [active.split, u.seed, u.canaryPct]);
  const att = attempts(u.failProb, u.appRetries, active.meshRetries);
  const certs = useMemo(() => certTimeline(u.lifetimeMin, NO_OUTAGE), [u.lifetimeMin]);
  const bars = useMemo<GanttBar[]>(() => certs.certs.map((c, i) => ({ id: `${c.workload}${i}`, lane: c.workload, start: c.issuedAt, end: Math.min(c.expiresAt, HORIZON_MIN), tone: 'violet', label: '' })), [certs]);

  useIntroCaption(meshCaption(u.mesh, split, att, u.appRetries, active.meshRetries), [JSON.stringify(u)]);

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Time per call" value={`${callMs(u.mesh)} ms`} sub={[u.mesh ? `${APP_CALL_MS} ms of work + ${extraHopMs(true)} ms of sidecars` : `${APP_CALL_MS} ms, no sidecar`]} />
          <Stat label="Backend calls per request" value={sig(att.expected)} color={att.worst > 4 ? 'var(--orange)' : undefined} sub={[`${att.worst} at worst`, `app retries ${u.appRetries}, mesh retries ${active.meshRetries}`]} />
          <Stat label="Canary share" value={split ? pct(split.observedPct / 100, 1) : 'no mesh'} sub={split ? [`set ${split.expectedPct}%, ±${sig(split.threeSePct)} points`, `${integer(split.canary)} of ${integer(split.canary + split.stable)}`] : ['needs a sidecar to split traffic']} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--violet)', label: 'a short-lived certificate a sidecar holds (the sidecar is not drawn)' }, { color: 'var(--orange)', label: 'a stat where retries multiply' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label="Sidecar proxy beside every service" value={u.mesh} onChange={(mesh) => set({ mesh })} off="no mesh" on="mesh" />
          <Button onClick={() => setU(initialMesh())}>Reset</Button>
        </>,
        u.mesh ? (
          <>
            <Toggle label="mTLS" value={u.mtls} onChange={(mtls) => set({ mtls })} />
            <Toggle label="Traffic splitting" value={u.split} onChange={(s) => set({ split: s })} />
            <Toggle label="Mesh retries" value={u.retries} onChange={(retries) => set({ retries })} />
          </>
        ) : (
          <Hint key="mesh-off" tone="muted">Turn the mesh on to get mTLS, traffic splitting and mesh retries.</Hint>
        ),
        <>
          {active.mtls && <Slider label="Certificate lifetime" value={u.lifetimeMin} {...LIFETIME_RANGE} format={minText} onChange={(lifetimeMin) => set({ lifetimeMin })} />}
          {active.split && <Slider label="Canary weight" value={u.canaryPct} {...CANARY_RANGE} format={(v) => `${v}%`} onChange={(canaryPct) => set({ canaryPct })} />}
          <Slider label="App retries" value={u.appRetries} {...RETRY_RANGE} onChange={(appRetries) => set({ appRetries })} />
          {u.mesh && u.retries && <Slider label="Mesh retries" value={u.meshRetries} {...RETRY_RANGE} onChange={(meshRetries) => set({ meshRetries })} />}
          <Slider label="Backend fails" value={u.failProb} {...FAIL_RATE_RANGE} format={(v) => pct(v, 0)} onChange={(failProb) => set({ failProb })} />
          <SeedField seed={u.seed} onSeed={(seed) => set({ seed })} />
        </>,
      ]}
    >
      <div className="sd-stage stage-pad">
        {active.mtls ? (
          <Box>
            <SectionTitle hint={`certificates of ${minText(u.lifetimeMin)}, renewed at half their life`}>mTLS: short-lived identities</SectionTitle>
            <WideRegion minWidth={GANTT_MIN_WIDTH} label="Certificate timeline: scroll sideways to see all of it">
              <GanttLanes lanes={['orders', 'payments', 'search'].map((w) => ({ id: w, label: w }))} bars={bars} domain={[0, HORIZON_MIN]} unit=" min" axis size="sm" labelWidth={92} labelMinPx={GANTT_LABEL_MIN_PX} ariaLabel="Certificate lifetimes of each workload" />
            </WideRegion>
          </Box>
        ) : (
          <Box>
            <SectionTitle>{u.mesh ? 'mTLS is off' : 'No mesh'}</SectionTitle>
            <p className="sd-note">{u.mesh ? 'Calls between sidecars are not encrypted or authenticated by the mesh.' : 'Services call each other directly: no sidecar, no mesh identity, no mesh features.'}</p>
          </Box>
        )}
        <Hint tone="muted" block>
          The data plane (the sidecars) carries traffic; a control plane pushes them configuration, which is the style of Envoy&apos;s xDS API (from memory). Retries in the app and in the mesh multiply: each app attempt is itself a mesh call with its own retries. Services here are identified by names, as SPIFFE-style IDs do (from memory).
        </Hint>
        <ProvenanceRow>
          <Provenance kind="not-run">no mesh is installed: this is a model, and products differ</Provenance>
          <Provenance kind="illustrative">the {extraHopMs(true)} ms hop, the certificate lifetimes and the failure rates are made up</Provenance>
          <Provenance kind="from-memory">xDS, SPIFFE-style identities and short-lived mesh certificates as many meshes describe them; verify against the product you use</Provenance>
          <Provenance kind="simulated" seed={u.seed}>the canary split is {integer(10_000)} seeded requests</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

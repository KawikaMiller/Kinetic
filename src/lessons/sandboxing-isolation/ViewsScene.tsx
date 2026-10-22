import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { bytes, plural } from '../../core/format';
import { viewsCaption } from './captions';
import {
  ALLOCATE_RANGE, CPU_WEIGHT_RANGE, FORKS_RANGE, MEMORY_LIMIT_RANGE, NAMESPACE_ORDER, OTHER_CPU_WEIGHT, PIDS_LIMIT_RANGE, VIEWS,
  cpuShare, memoryOutcome, pidsOutcome, rootIsHostRoot, viewOf, type NamespaceId,
} from './isolation';
import { initialViews } from './opening';

const MIB_FORMAT = (v: number) => `${v} MiB`;

/** Scene 3: what the sandboxed process sees with each namespace on or off, and what the cgroup limits do. */
export function ViewsScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialViews);
  const on = new Set(state.namespaces);
  const mem = memoryOutcome(state.memoryLimitMiB, state.allocateMiB);
  const pids = pidsOutcome(state.pidsLimit, state.forks);
  const share = cpuShare(state.cpuWeight, OTHER_CPU_WEIGHT);
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const toggle = (id: NamespaceId, value: boolean) => set({ namespaces: NAMESPACE_ORDER.filter((n) => (n === id ? value : state.namespaces.includes(n))) });

  return (
    <StageFrame
      height={470}
      intro={viewsCaption(state.namespaces, state.memoryLimitMiB, state.allocateMiB, state.pidsLimit, state.forks, state.cpuWeight)}
      introKey={[state.namespaces.join(','), state.memoryLimitMiB, state.allocateMiB, state.pidsLimit, state.forks, state.cpuWeight]}
      stats={
        <Stats>
          <Stat label="Namespaces on" value={`${on.size} of ${NAMESPACE_ORDER.length}`} color="var(--violet)" sub={rootIsHostRoot(on) ? 'uid 0 inside is uid 0 on the host' : 'root inside is an unprivileged host id'} />
          <Stat label="Memory" value={mem.killed ? 'killed' : 'within the limit'} color={mem.killed ? 'var(--bad)' : 'var(--ok)'} sub={mem.killed ? `at byte ${mem.killedAtByte!.toLocaleString('en-US')}` : `${bytes(mem.requested, { iec: true })} of ${bytes(mem.limit, { iec: true })}`} />
          <Stat label="Forks" value={`${pids.started} of ${pids.attempted} started`} color={pids.failed > 0 ? 'var(--bad)' : 'var(--ok)'} sub={pids.failed > 0 ? `fork ${pids.firstFailure} and after fail` : `limit ${pids.limit} processes`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'a private namespace view', shape: 'square' },
            { color: 'var(--dim)', label: 'the host view (namespace off)', shape: 'square' },
            { color: 'var(--bad)', label: 'killed or refused by a limit', shape: 'square' },
            { color: 'var(--ok)', label: 'within the limit', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {NAMESPACE_ORDER.map((id) => (
            <Toggle key={id} label={id} value={on.has(id)} onChange={(v) => toggle(id, v)} />
          ))}
        </>,
        <>
          <Slider label="Memory limit" value={state.memoryLimitMiB} {...MEMORY_LIMIT_RANGE} onChange={(v) => set({ memoryLimitMiB: v })} format={MIB_FORMAT} />
          <Slider label="Allocate" value={state.allocateMiB} {...ALLOCATE_RANGE} onChange={(v) => set({ allocateMiB: v })} format={MIB_FORMAT} />
          <Slider label="Process limit" value={state.pidsLimit} {...PIDS_LIMIT_RANGE} onChange={(v) => set({ pidsLimit: v })} />
          <Slider label="Forks tried" value={state.forks} {...FORKS_RANGE} onChange={(v) => set({ forks: v })} />
          <Slider label="CPU weight" value={state.cpuWeight} {...CPU_WEIGHT_RANGE} onChange={(v) => set({ cpuWeight: v })} />
        </>,
      ]}
    >
      <div className="sb-stage stage-pad">
        <div className="sb-block">
          <SectionTitle>What the sandboxed process sees</SectionTitle>
          <div className="sb-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Sees</th>
                </tr>
              </thead>
              <tbody>
                {NAMESPACE_ORDER.map((id) => (
                  <tr key={id}>
                    <td>{VIEWS[id].label}</td>
                    <td style={{ color: on.has(id) ? 'var(--violet)' : 'var(--dim)' }}>{viewOf(id, on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="sb-block">
          <SectionTitle>cgroup limits</SectionTitle>
          <Bar value={mem.held} max={Math.max(mem.limit, mem.requested)} color={mem.killed ? 'var(--bad)' : 'var(--ok)'} marker={mem.limit} markLabel={`limit ${bytes(mem.limit, { iec: true })}`} label={`memory held: ${bytes(mem.held, { iec: true })} of a ${bytes(mem.limit, { iec: true })} limit`} />
          <Bar value={pids.started} max={Math.max(pids.attempted, 1)} color={pids.failed > 0 ? 'var(--bad)' : 'var(--ok)'} label={`children started: ${plural(pids.started, 'child', 'children')} of ${pids.attempted} tried (the plugin counts against the limit of ${pids.limit})`} />
          <Bar value={share} max={1} color="var(--info)" label={`CPU share under contention: ${Math.round(share * 100)}% (weight ${state.cpuWeight} against ${OTHER_CPU_WEIGHT})`} />
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">no process is isolated: the views are lesson-authored text and the limits are exact functions of the sliders</Provenance>
        <Provenance kind="from-memory">the same user id is not the same power: a container runtime usually also drops capabilities from root, and a user namespace is one separate step. Verify against your runtime's documentation</Provenance>
        <Provenance kind="illustrative">the memory kill at the first byte over is a simplification: a real kernel counts pages and tries to reclaim memory first</Provenance>
        <Provenance kind="from-memory">the namespace kinds, the uid map form and cgroup CPU weights come from memory: check the kernel and container runtime documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

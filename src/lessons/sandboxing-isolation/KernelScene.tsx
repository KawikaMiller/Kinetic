import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { kernelCaption } from './captions';
import { initialKernel } from './opening';
import { RING_ABOUT, RING_LABEL, RING_ORDER } from './rings';
import { HOST_SYSCALL_COUNT, SURFACES, SURFACE_MODES, sharesHostKernel, type SurfaceMode } from './surface';

const BAR_TONE = { process: 'var(--bad)', seccomp: 'var(--orange)', microvm: 'var(--ok)' } as const;

/** Scene 4: the kernel is shared by every ring except the microVM's, and the surface that is left is a choice. */
export function KernelScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialKernel);
  const picked = SURFACES[state.mode];

  return (
    <StageFrame
      height={420}
      intro={kernelCaption(state.mode)}
      introKey={[state.mode]}
      stats={
        <Stats>
          <Stat label="Exposed surface" value={picked.exposed} color={BAR_TONE[state.mode]} sub={`${picked.unit}, illustrative`} />
          <Stat label="Under it" value={state.mode === 'microvm' ? 'a guest kernel' : 'the host kernel'} color={state.mode === 'microvm' ? 'var(--ok)' : 'var(--bad)'} sub={picked.under} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the shared host kernel', shape: 'square' },
            { color: 'var(--orange)', label: 'a narrowed list of calls', shape: 'square' },
            { color: 'var(--ok)', label: 'a guest kernel in between', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<SurfaceMode> label="The plugin runs" value={state.mode} onChange={(v) => setState({ mode: v })} options={[...SURFACE_MODES]} />
        </>,
      ]}
    >
      <div className="sb-stage stage-pad">
        <div className="sb-block">
          <SectionTitle>Exposed attack surface (named, illustrative constants; different units, for scale only)</SectionTitle>
          {SURFACE_MODES.map((m) => (
            <Bar
              key={m.value}
              value={SURFACES[m.value].exposed}
              max={HOST_SYSCALL_COUNT}
              color={BAR_TONE[m.value]}
              label={`${m.label}: ${SURFACES[m.value].exposed} ${SURFACES[m.value].unit}: ${SURFACES[m.value].label}`}
              className={m.value === state.mode ? 'sb-picked-bar' : undefined}
            />
          ))}
        </div>
        <div className="sb-block">
          <SectionTitle>Which boundaries stand between the plugin and the host kernel</SectionTitle>
          <div className="sb-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Boundary</th>
                  <th>Kernel under it</th>
                </tr>
              </thead>
              <tbody>
                {RING_ORDER.map((r) => (
                  <tr key={r}>
                    <td title={RING_ABOUT[r]}>{RING_LABEL[r]}</td>
                    <td style={{ color: sharesHostKernel(r) ? 'var(--bad)' : 'var(--ok)' }}>{sharesHostKernel(r) ? 'the host kernel, shared' : 'a separate guest kernel'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sb-note">A container is an ordinary process with restricted views. Its boundaries are enforced by the same kernel they run on, so a bug in that kernel sits under every ring except the microVM.</p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="illustrative">the surface sizes are named constants for scale, not measurements (a current Linux kernel has 300 or more calls on x86-64: verify)</Provenance>
        <Provenance kind="simulated">nothing runs here; the stage never describes how any boundary is defeated</Provenance>
        <Provenance kind="from-memory">container isolation and microVM designs come from memory: check the runtime and hypervisor documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

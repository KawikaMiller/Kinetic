import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { ioCaption } from './ioText';
import { deviceExits, EPT, EXAMPLE_GVA, EXIT_CYCLES, GUEST_PT, nestedWalkRefs, translate, type Device } from './model';

const hex = (n: number) => `0x${n.toString(16)}`;
const LEVELS = 4;
const MAX_PACKETS = 64;

export function MemoryScene({ picker }: { picker: ReactNode }) {
  const [device, setDevice] = useState<Device>('emulated');
  const [packets, setPackets] = useState(16);
  const setCaption = useSetCaption();
  useIntroCaption(ioCaption('emulated', 16));
  const update = (d: Device, p: number) => {
    setDevice(d);
    setPackets(p);
    setCaption(ioCaption(d, p), { quiet: true });
  };
  const gpa = translate(EXAMPLE_GVA, GUEST_PT)!;
  const hpa = translate(gpa, EPT)!;
  const max = deviceExits('emulated', MAX_PACKETS) * EXIT_CYCLES;

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Native TLB miss" value={`${LEVELS} reads`} sub="4-level page table" />
          <Stat label="Nested TLB miss" value={`up to ${nestedWalkRefs(LEVELS, LEVELS)} reads`} sub="(4+1)×(4+1)−1" color="var(--violet)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: "guest's translation" },
            { color: 'var(--info)', label: "hypervisor's translation (EPT / NPT)" },
            { color: 'var(--violet)', label: 'nested walk cost' },
            { color: 'var(--bad)', label: 'emulated NIC exits (costly)' },
            { color: 'var(--ok)', label: 'virtio exits (cheap)' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented
            label="Network device"
            value={device}
            onChange={(d) => update(d, packets)}
            options={[
              { value: 'emulated', label: 'Emulated NIC (e1000)' },
              { value: 'virtio', label: 'virtio-net' },
            ]}
          />
          <Slider label="Packets sent" value={packets} min={1} max={MAX_PACKETS} onChange={(p) => update(device, p)} />
        </>,
      ]}
    >
      <div className="vh stage-pad">
        <div>
          <SectionTitle>Memory: two translations</SectionTitle>
          <div className="vh-chain">
            <span className="vh-addr">
              guest virtual <b>{hex(EXAMPLE_GVA)}</b>
            </span>
            <span className="vh-step tone-amber">guest page table (the guest kernel&apos;s) ⟶</span>
            <span className="vh-addr">
              guest physical <b>{hex(gpa)}</b>
            </span>
            <span className="vh-step tone-info">EPT / NPT (the hypervisor&apos;s) ⟶</span>
            <span className="vh-addr">
              host physical <b>{hex(hpa)}</b>
            </span>
          </div>
          <Hint block>
            The guest thinks its &quot;physical&quot; addresses are real RAM; the CPU translates them a second time. Each guest page-table entry sits at a guest-physical address too,
            so a TLB miss can cost up to {nestedWalkRefs(LEVELS, LEVELS)} memory reads. One level is the <code>virtual-memory-paging</code> lesson.
          </Hint>
        </div>
        <div className="vh-io">
          <SectionTitle>I/O: VM exits for {packets} packets (illustrative, to scale)</SectionTitle>
          {(['emulated', 'virtio'] as Device[]).map((d) => (
            <div key={d} className={`vh-io-row ${d === device ? 'is-now' : ''}`}>
              <span>{d === 'emulated' ? 'emulated NIC' : 'virtio-net'}</span>
              <Bar value={deviceExits(d, packets) * EXIT_CYCLES} max={max} tone={d === 'emulated' ? 'bad' : 'ok'} height={10} />
              <b>
                {deviceExits(d, packets)} exits · {(deviceExits(d, packets) * EXIT_CYCLES).toLocaleString('en-US')} cycles
              </b>
            </div>
          ))}
        </div>
      </div>
    </StageFrame>
  );
}

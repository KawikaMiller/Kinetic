import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { overcommitCaption, ratioText } from './ioText';
import { HOST_GB, overcommit, VM_GB } from './model';

const MAX_VMS = 6;

export function OvercommitScene({ picker }: { picker: ReactNode }) {
  const [vms, setVms] = useState(4);
  const [used, setUsed] = useState(3);
  const setCaption = useSetCaption();
  useIntroCaption(overcommitCaption(4, 3));
  const update = (n: number, u: number) => {
    setVms(n);
    setUsed(u);
    setCaption(overcommitCaption(n, u), { quiet: true });
  };
  const o = overcommit(vms, used);
  const scale = Math.max(o.committed, HOST_GB);
  const pct = (gb: number) => `${(gb / scale) * 100}%`;

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Promised" value={`${o.committed} GB`} />
          <Stat label="Overcommit" value={ratioText(o.ratio)} color={o.ratio > 1 ? 'var(--orange)' : undefined} />
          <Stat label="Really used" value={`${o.used} GB`} color={o.short ? 'var(--orange)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: `promised, within host RAM (${HOST_GB} GB)` },
            { color: 'var(--info)', label: 'used, within host RAM' },
            { color: 'var(--orange)', label: 'beyond physical RAM' },
            { color: 'var(--text)', label: 'host RAM limit', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="VMs" value={vms} min={1} max={MAX_VMS} onChange={(n) => update(n, used)} format={(n) => `${n} × ${VM_GB} GB`} />
          <Slider label="Each VM really uses" value={used} min={1} max={VM_GB} onChange={(u) => update(vms, u)} format={(u) => `${u} GB`} />
        </>,
      ]}
    >
      <div className="vh stage-pad">
        <div className="vh-mem" aria-label={`${o.committed} GB promised, ${o.used} GB used, ${HOST_GB} GB physical`}>
          <span className="vh-mem-label">promised</span>
          <div className="vh-mem-track">
            <i className="tone-muted" style={{ width: pct(Math.min(o.committed, HOST_GB)) }} />
            <i className="tone-orange" style={{ width: pct(Math.max(0, o.committed - HOST_GB)) }} />
            <span className="vh-mem-line" style={{ left: pct(HOST_GB) }} />
          </div>
          <span className="vh-mem-label">used</span>
          <div className="vh-mem-track">
            <i className="tone-info" style={{ width: pct(Math.min(o.used, HOST_GB)) }} />
            <i className="tone-orange" style={{ width: pct(o.short) }} />
            <span className="vh-mem-line" style={{ left: pct(HOST_GB) }} />
          </div>
        </div>
        <Hint block>
          To scale: the light line marks the host&apos;s {HOST_GB} GB. Toy numbers. Hypervisors also merge identical pages between guests (KSM on Linux), which this leaves out.
        </Hint>
      </div>
    </StageFrame>
  );
}

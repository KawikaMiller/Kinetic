import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Hint, Legend, Provenance, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../distributions/fmt';
import { serverCaption } from './frames';
import { SERVER_DEFAULT, bigText, parseCpuMs, parsePeak, servers, type Redundancy } from './model';
import { useNumberField } from './useNumberField';

const REDUNDANCY: Option<Redundancy>[] = [
  { value: 'none', label: 'None' },
  { value: 'n+1', label: 'N + 1' },
  { value: 'zones', label: 'Survive losing 1 of 3 zones' },
];
const MAX_ICONS = 60;

export function ServerScene({ picker }: { picker: ReactNode }) {
  const peak = useNumberField(SERVER_DEFAULT.peak, parsePeak);
  const cpu = useNumberField(SERVER_DEFAULT.cpuMs, parseCpuMs);
  const [cores, setCores] = useState(SERVER_DEFAULT.cores);
  const [target, setTarget] = useState(SERVER_DEFAULT.target);
  const [redundancy, setRedundancy] = useState<Redundancy>(SERVER_DEFAULT.redundancy);

  const s = servers({ peak: peak.value, cores, cpuMs: cpu.value, target, redundancy });
  useIntroCaption(serverCaption(s), [peak.value, cpu.value, cores, target, redundancy]);

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="One server" value={`${bigText(s.perServerAtTarget)} /s`} sub={[`${bigText(s.perServerAtFull)} /s at 100% CPU`, `${cores} cores × 1,000 ms ÷ ${bigText(cpu.value)} ms`]} />
          <Stat label="Servers" value={String(s.total)} color="var(--hi)" sub={[`⌈${bigText(peak.value)} ÷ ${bigText(s.perServerAtTarget)}⌉ = ${s.base}`, s.extra ? `+ ${s.extra} for redundancy` : 'no redundancy']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'servers the peak needs' },
            { color: 'var(--violet)', label: 'redundancy servers' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Peak requests per second" value={peak.text} onChange={peak.onChange} width={130} spellCheck={false} />
          <TextField label="CPU ms per request" value={cpu.text} onChange={cpu.onChange} width={100} spellCheck={false} />
        </>,
        <>
          <Slider label="Cores per server" value={cores} min={1} max={64} onChange={setCores} />
          <Slider label="Target utilisation" value={target} min={0.1} max={1} step={0.05} format={(v) => pctText(v, 0)} onChange={setTarget} />
          <Segmented label="Redundancy" value={redundancy} onChange={setRedundancy} options={REDUNDANCY} />
        </>,
      ]}
    >
      <div className="boe-stage stage-pad">
        <Box className="boe-strip">
          <SectionTitle hint={`${s.total} servers${s.total > MAX_ICONS ? `, ${MAX_ICONS} drawn` : ''}`}>The fleet</SectionTitle>
          <div className="boe-fleet" role="img" aria-label={`${s.base} servers for the peak and ${s.extra} for redundancy`}>
            {Array.from({ length: Math.min(s.total, MAX_ICONS) }, (_, i) => (
              <i key={i} className={i < s.base ? 'boe-server' : 'boe-spare'} />
            ))}
          </div>
          <Hint tone="muted" block>Target utilisation sits well below 100% so queues stay short: see the queueing lesson for why waits grow as 1/(1 − ρ).</Hint>
          {(peak.error || cpu.error) && <span className="boe-refusal" role="status">{peak.error ?? cpu.error} Keeping the last valid number.</span>}
        </Box>
        <div className="boe-chips">
          <Provenance kind="illustrative">cores, CPU time per request and the 60% target are made-up defaults</Provenance>
        </div>
        <Hint tone="muted" className="boe-note">Arithmetic, not a design: it ignores memory, network, caches and uneven load. Estimates are for order of magnitude.</Hint>
      </div>
    </StageFrame>
  );
}

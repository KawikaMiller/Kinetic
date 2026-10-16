import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { coherenceCaption } from './captions';
import { DEFAULT_COHERENCE, dmaScenario, type CoherenceInput } from './coherence';

const hex2 = (v: number) => `0x${v.toString(16).toUpperCase().padStart(2, '0')}`;

export function CoherenceScene({ picker }: { picker: ReactNode }) {
  const [input, setInput] = useState<CoherenceInput>(DEFAULT_COHERENCE);
  const r = useMemo(() => dmaScenario(input), [input]);
  const set = (patch: Partial<CoherenceInput>) => setInput((i) => ({ ...i, ...patch }));

  return (
    <StageFrame
      height={360}
      intro={coherenceCaption(r)}
      introKey={[input.coherent, input.driverInvalidates, input.iommu]}
      stats={
        <Stats>
          <Stat label="CPU read" value={hex2(r.cpuSaw)} color={r.stale ? 'var(--bad)' : 'var(--ok)'} sub={r.stale ? 'stale: from the cache line' : r.servedFromCache ? 'from the cache line' : 'refilled from RAM'} />
          <Stat label="RAM holds" value={hex2(r.ramHolds)} sub="what the device wrote" />
          <Stat label="Unrelated buffer" value={hex2(r.kernelBufferAfter)} color={r.overwritten ? 'var(--bad)' : 'var(--ok)'} sub={r.overwritten ? 'overwritten by the device' : 'untouched'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the CPU sees what the device wrote, or the unrelated buffer is safe', shape: 'square' },
            { color: 'var(--bad)', label: 'a stale read, or a buffer overwritten by a stray DMA', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="DMA writes are cache-coherent" value={input.coherent} onChange={(coherent) => set({ coherent })} off="No" on="Yes" />
          {!input.coherent && <Toggle label="Driver invalidates the line" value={input.driverInvalidates} onChange={(driverInvalidates) => set({ driverInvalidates })} off="No" on="Yes" />}
          <Toggle label="IOMMU" value={input.iommu} onChange={(iommu) => set({ iommu })} off="Off" on="On" />
        </>,
      ]}
    >
      <div className="dma-stage stage-pad">
        <Box>
          <SectionTitle hint="a one-line cache over one buffer, simulated for real">What happens, step by step</SectionTitle>
          <ol className="dma-steps">
            {r.steps.map((step, i) => <li key={i} className={step.bad ? 'is-bad' : ''}>{step.text}</li>)}
          </ol>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">one cache line, one buffer, invented values</Provenance>
          <Provenance kind="from-memory">many x86 systems keep DMA coherent with CPU caches; many ARM designs need explicit cache maintenance. Which hardware behaves which way: verify against the platform manual</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

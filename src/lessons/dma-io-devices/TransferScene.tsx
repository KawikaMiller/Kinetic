import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { cpuBreakdown, n, sizeLabel, transferCaption } from './captions';
import { LANES, ganttBars } from './gantt';
import {
  BUS_WORD_TICKS, DEFAULT_BUS, DEFAULT_MODE, DEFAULT_SIZE_INDEX, DEVICE_READY_TICKS, DMA_SETUP_TICKS, IRQ_TICKS, JOB_TICKS, PIO_WORD_TICKS, SIZES, STEAL_PERIOD, WORD_BYTES, chartEnd, plan,
  type BusMode, type Mode,
} from './transfer';

const MODE_OPTIONS = [
  { value: 'pio' as const, label: 'Programmed I/O' },
  { value: 'irq-pio' as const, label: 'Interrupt-driven PIO' },
  { value: 'dma' as const, label: 'DMA' },
];
const GANTT_MIN_WIDTH = 520;

export function TransferScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX);
  const [bus, setBus] = useState<BusMode>(DEFAULT_BUS);
  const bytes = SIZES[sizeIndex];
  const p = useMemo(() => plan(mode, bytes, bus), [mode, bytes, bus]);
  const bars = useMemo(() => ganttBars(p, bus), [p, bus]);
  const end = chartEnd(bytes);

  return (
    <StageFrame
      height={380}
      intro={transferCaption(p, bus)}
      introKey={[p, bus]}
      stats={
        <Stats>
          <Stat label="CPU ticks on the transfer" value={n(p.cpuTransferTicks)} color="var(--hi)" sub={cpuBreakdown(p)} />
          <Stat label="Job ticks during it" value={n(p.jobTicksDuringTransfer)} color="var(--ok)" sub={[`job finishes at tick ${n(p.finish)}`, `of ${n(JOB_TICKS)} ticks of work`]} />
          <Stat label="Bytes delivered" value={n(p.bytesDelivered)} sub={`${n(p.words)} words of ${WORD_BYTES} bytes`} />
          <Stat label="Bus ticks lost to contention" value={n(p.contentionTicks)} color={p.contentionTicks > 0 ? 'var(--orange)' : undefined} sub={p.busHeldTicks > 0 ? `device held the bus ${n(p.busHeldTicks)} ticks` : 'the CPU is the bus master here'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'CPU busy on the transfer: copy, poll, setup', shape: 'square' },
            { color: 'var(--pink)', label: 'interrupt', shape: 'square' },
            { color: 'var(--ok)', label: 'the useful job', shape: 'square' },
            { color: 'var(--orange)', label: 'job stalled on the bus', shape: 'square' },
            { color: 'var(--info)', label: 'bus held by the device', shape: 'square' },
            { color: 'var(--dim)', label: 'device not ready yet (dashed)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="How the block moves" value={mode} onChange={setMode} options={MODE_OPTIONS} />
        </>,
        <>
          <Slider label="Transfer size" value={sizeIndex} min={0} max={SIZES.length - 1} onChange={setSizeIndex} format={(i) => sizeLabel(SIZES[i])} />
          <Toggle label="DMA bus sharing" value={bus === 'steal'} onChange={(v) => setBus(v ? 'steal' : 'burst')} off="Burst" on="Cycle stealing" />
        </>,
      ]}
    >
      <div className="dma-stage stage-pad">
        <Box>
          <SectionTitle hint="every number below is in ticks of an imaginary clock">One block, device to RAM</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Timeline of CPU, bus and device: scroll sideways to see all of it">
            <GanttLanes lanes={LANES} bars={bars} domain={[0, end]} axis size="md" labelMinPx={64} ariaLabel={`${MODE_OPTIONS.find((o) => o.value === mode)!.label} of ${sizeLabel(bytes)}`} />
          </WideRegion>
          <Hint tone="muted" block>
            The CPU has a {n(JOB_TICKS)}-tick job that touches memory every tick, the worst case for bus contention. The device needs {n(DEVICE_READY_TICKS)} ticks
            before its block is ready. {mode === 'dma' ? `The bus-sharing switch applies to DMA only: a burst takes the bus for the whole window, cycle stealing takes 1 cycle in ${STEAL_PERIOD}.` : 'The bus-sharing switch applies to DMA only, so it changes nothing in this mode.'}
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">ticks, not measured: {PIO_WORD_TICKS} per copied word, {BUS_WORD_TICKS} per bus word, {DMA_SETUP_TICKS} to program the device, {IRQ_TICKS} per interrupt</Provenance>
          <Provenance kind="toy">one device with its block ready after {DEVICE_READY_TICKS} ticks; real devices, buses and arbiters differ</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { bytes } from '../../core/format';
import { logScale } from '../../core/scale';
import { randomReadMs } from './hdd';
import { AHCI_QUEUE_DEPTH, CHANNELS, deviceDepth, MAX_QD, NVME_MAX_QUEUE_DEPTH, NVME_MAX_QUEUES, PAGE_BYTES, queueRun, type Interface } from './nvme';
import { queueCaption } from './queueText';

const SHOW_US = 600;
const NVME_QUEUES_SHOWN = 4;
const NVME_SLOTS_SHOWN = MAX_QD / NVME_QUEUES_SHOWN;

const LANES = [...Array.from({ length: CHANNELS }, (_, k) => ({ id: `ch${k}`, label: `channel ${k}` })), { id: 'link', label: 'host link' }];

export function NvmeScene({ picker }: { picker: ReactNode }) {
  const [qd, setQd] = useState(1);
  const [iface, setIface] = useState<Interface>('nvme');
  const setCaption = useSetCaption();
  const run = useMemo(() => queueRun(qd, iface, SHOW_US), [qd, iface]);
  useIntroCaption(queueCaption(queueRun(1, 'nvme'), queueRun(1, 'nvme')));

  const update = (nextQd: number, nextIface: Interface) => {
    setQd(nextQd);
    setIface(nextIface);
    setCaption(queueCaption(queueRun(nextQd, nextIface), queueRun(1, nextIface)), { quiet: true });
  };

  const bars: GanttBar[] = run.bars.map((b, i) => ({ id: `b${i}`, lane: b.lane, start: b.start, end: Math.min(b.end, SHOW_US), tone: b.lane === 'link' ? 'violet' : 'info' }));
  const inDevice = deviceDepth(qd, iface);
  const rows = iface === 'sata' ? 1 : NVME_QUEUES_SHOWN;
  const cols = iface === 'sata' ? AHCI_QUEUE_DEPTH : NVME_SLOTS_SHOWN;
  // NVMe spreads the outstanding commands over one queue per CPU core, round-robin.
  const filled = (r: number, c: number) => (iface === 'sata' ? c < inDevice : c * NVME_QUEUES_SHOWN + r < inDevice);

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Reads / s" value={Math.round(run.iops).toLocaleString('en-US')} sub="4 KiB, illustrative" />
          <Stat label="Throughput" value={`${bytes((run.iops * PAGE_BYTES), { base: 1000 })}/s`} />
          <Stat label="Avg latency" value={`${Math.round(run.latencyUs)} µs`} />
          <Stat label="Busy channels" value={`${run.busyChannels.toFixed(1)} of ${CHANNELS}`} color="var(--info)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'flash read on a channel / command queued' },
            { color: 'var(--violet)', label: 'transfer over the host link' },
            { color: 'var(--muted)', label: 'empty queue slot (outline)' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Toggle label="Interface" value={iface === 'nvme'} onChange={(v) => update(qd, v ? 'nvme' : 'sata')} off="SATA (AHCI)" on="NVMe (PCIe)" />
          <Slider label="Queue depth" value={qd} min={1} max={MAX_QD} onChange={(v) => update(v, iface)} format={(v) => `${v} outstanding`} />
        </>,
      ]}
    >
      <div className="sd stage-pad">
        <div className="sd-queues">
          <span className="section-title">{iface === 'sata' ? 'AHCI: one command queue, 32 slots' : `NVMe: one queue per CPU core (${NVME_QUEUES_SHOWN} shown)`}</span>
          <CellGrid rows={rows} cols={cols} size={{ cell: 12, gap: 2 }} cell={(r, c) => (filled(r, c) ? { tone: 'info', fill: 'solid' } : { tone: 'muted', fill: 'outline' })} ariaLabel={`${inDevice} commands queued in the drive`} />
          <Hint block>
            {iface === 'sata' ? (
              qd > AHCI_QUEUE_DEPTH ? <>{qd - AHCI_QUEUE_DEPTH} more wait in the OS: AHCI can't hold more than 32.</> : <>AHCI (native command queuing) holds at most 32 commands.</>
            ) : (
              <>The NVMe spec allows up to {NVME_MAX_QUEUES.toLocaleString('en-US')} I/O queues of up to {NVME_MAX_QUEUE_DEPTH.toLocaleString('en-US')} entries each (so up to {(NVME_MAX_QUEUE_DEPTH - 1).toLocaleString('en-US')} commands in flight per queue); real drives offer fewer.</>
            )}
          </Hint>
        </div>
        <WideRegion minWidth={480} label="Channel timeline: scroll sideways to see all of it">
          <GanttLanes lanes={LANES} bars={bars} domain={[0, SHOW_US]} axis unit=" µs" size="sm" labelWidth={78} ariaLabel={`Flash channels and host link over the first ${SHOW_US} µs`} />
        </WideRegion>
        <Hint block>Simplified: each read goes to whichever channel is free. A real read has to go to the chip that holds its data, so some channels queue up while others idle.</Hint>
        <LatencyStrip />
      </div>
    </StageFrame>
  );
}

const LOG = logScale(10_000, 100_000_000, 0, 100);

function LatencyStrip() {
  const rows = [
    { label: 'HDD random read', ns: randomReadMs() * 1e6, tone: 'bad' },
    { label: 'SATA SSD read (queue depth 1)', ns: queueRun(1, 'sata').deviceLatencyUs * 1e3, tone: 'info' },
    { label: 'NVMe SSD read (queue depth 1)', ns: queueRun(1, 'nvme').deviceLatencyUs * 1e3, tone: 'ok' },
  ] as const;
  const fmt = (ns: number) => (ns >= 1e6 ? `${(ns / 1e6).toFixed(1)} ms` : `${Math.round(ns / 1e3)} µs`);
  return (
    <div className="sd-latency" aria-label="Illustrative read latency, log scale">
      <span className="section-title">
        Read latency <span className="hint-inline">illustrative, log scale: every quarter of a bar is 10× more</span>
      </span>
      {rows.map((r) => (
        <div key={r.label} className="sd-lat-row">
          <span className="sd-lat-label">{r.label}</span>
          <span className="sd-lat-track">
            <i className={`tone-${r.tone}`} style={{ width: `${LOG.map(r.ns)}%` }} />
          </span>
          <b>{fmt(r.ns)}</b>
        </div>
      ))}
      <Hint block>
        This gap is why log-structured designs (<code>lsm-trees</code>, a database's write-ahead log) write sequentially: on a disk it skips the seek and the wait, and on an SSD it fills whole
        blocks, so garbage collection finds blocks with nothing left to copy. See <code>memory-hierarchy</code> for where this sits next to RAM.
      </Hint>
    </div>
  );
}

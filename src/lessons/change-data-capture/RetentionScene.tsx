import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { bytes } from '../../core/format';
import { retentionText } from './captions';
import { DISK_BUDGET_BYTES, MAX_TICKS, WRITES_PER_TICK, retentionAt, retentionSeries, type RetentionConfig } from './retention';
import { RETENTION_OPEN } from './view';

const MIB = 1024 * 1024;

export function RetentionScene({ picker }: { picker: ReactNode }) {
  const [slot, setSlot] = useState<boolean>(RETENTION_OPEN.slot);
  const [lag, setLag] = useState<number>(RETENTION_OPEN.lag);
  const [deadAt, setDeadAt] = useState<number>(RETENTION_OPEN.deadAt);
  const [now, setNow] = useState<number>(RETENTION_OPEN.now);

  const config: RetentionConfig = useMemo(() => ({ slot, lagRecords: lag, deadAt }), [slot, lag, deadAt]);
  const series = useMemo(() => retentionSeries(config), [config]);
  const yMax = Math.ceil(Math.max(DISK_BUDGET_BYTES, ...series.map((p) => p.bytes)) / MIB * 1.1 * 10) / 10;
  const point = retentionAt(config, now);
  const caption = retentionText(point, slot);
  const never = deadAt > MAX_TICKS;

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Log kept on disk" value={bytes(point.bytes, { iec: true, dp: 1 })} color={point.overBudget ? 'var(--bad)' : 'var(--ok)'} sub={`budget ${bytes(DISK_BUDGET_BYTES, { iec: true })}`} />
          <Stat label="Reader's saved position" value={`${point.saved.toLocaleString('en-US')} records`} color="var(--violet)" sub={`${point.written.toLocaleString('en-US')} written so far`} />
          <Stat label="Reader can resume" value={point.resumable ? 'yes' : 'no'} color={point.resumable ? 'var(--ok)' : 'var(--bad)'} sub={slot ? 'the slot keeps what it needs' : 'unread log was recycled'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'log kept on disk', shape: 'line' },
            { color: 'var(--bad)', label: 'the disk budget', shape: 'line' },
            { color: 'var(--violet)', label: 'the tick now', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="The source keeps the log for the reader" value={slot} onChange={setSlot} off="No (recycles)" on="Yes (a slot)" />
        </>,
        <>
          <Slider label="Reader lags by" value={lag} min={0} max={500} step={50} onChange={setLag} format={(v) => `${v} records`} />
          <Slider label="Reader dies at tick" value={deadAt} min={0} max={MAX_TICKS + 1} onChange={setDeadAt} format={(v) => (v > MAX_TICKS ? 'never' : String(v))} />
          <Slider label="Tick now" value={now} min={0} max={MAX_TICKS} onChange={setNow} />
        </>,
      ]}
    >
      <div className="cdc-stage stage-pad">
        <Box>
          <SectionTitle hint={`${WRITES_PER_TICK} records written per tick${never ? ', the reader never dies' : ''}`}>Log on disk over time</SectionTitle>
          <Plot2D x={{ domain: [0, MAX_TICKS], label: 'tick' }} y={{ domain: [0, yMax], label: 'MiB of log', format: (v) => `${v}` }} ariaLabel="Log kept on disk over time">
            <Curve points={series.map((p) => [p.tick, p.bytes / MIB])} tone="hi" />
            <HLine at={DISK_BUDGET_BYTES / MIB} label="budget" tone="bad" />
            <VLine at={now} label={`${now}`} tone="violet" />
          </Plot2D>
          <Hint tone="muted" block>The log is kept in segments, so the figure steps up a segment at a time. A schema change (an added column) is one more record in the same stream, delivered in order with the row changes.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">the write rate, record size and disk budget are made up round numbers</Provenance>
          <Provenance kind="from-memory">in PostgreSQL an inactive replication slot retains WAL until it is read or dropped, so a dead consumer can fill the disk; newer versions offer a cap, check the PostgreSQL docs for your version</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

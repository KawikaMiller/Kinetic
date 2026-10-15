import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { storageCaption } from './frames';
import {
  NIC_BYTES_PER_SECOND, NIC_GBIT, STORAGE_DEFAULT, TRAFFIC_DEFAULT, add, bandwidth, bigText, dimsText, parseRecord, parseWrites, quantity, storage, traffic,
} from './model';
import { useNumberField } from './useNumberField';
import { pctText } from '../../core/format';

/** The peak QPS this scene's bandwidth line uses: scene 1's defaults, stated on screen so it is not a hidden input. */
const PEAK_QPS = traffic({ dau: 1e8, actionsPerUser: TRAFFIC_DEFAULT.actions, peakFactor: TRAFFIC_DEFAULT.peak, readsPerWrite: 1, round: false }).peak.value;

/** Shows the refusal that bytes and bits are not added: the algebra throws, the page says why. */
function addRefusal(): string {
  try {
    add(quantity(1, { B: 1 }), quantity(1, { bit: 1 }));
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : 'refused';
  }
}

export function StorageScene({ picker }: { picker: ReactNode }) {
  const record = useNumberField(STORAGE_DEFAULT.record, parseRecord);
  const writes = useNumberField(STORAGE_DEFAULT.writes, parseWrites);
  const [retention, setRetention] = useState(STORAGE_DEFAULT.retention);
  const [replicas, setReplicas] = useState(STORAGE_DEFAULT.replicas);
  const [overhead, setOverhead] = useState(STORAGE_DEFAULT.overhead);
  const [binary, setBinary] = useState(STORAGE_DEFAULT.binary);
  const [payload, setPayload] = useState(STORAGE_DEFAULT.payload);

  const s = storage({ recordBytes: record.value, writesPerDay: writes.value, retentionDays: retention, replicas, overhead, binary });
  const b = bandwidth(payload, PEAK_QPS);
  useIntroCaption(storageCaption(s, b), [record.value, writes.value, retention, replicas, overhead, binary, payload]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Stored" value={`${bigText(s.inUnit)} ${s.unitName}`} color="var(--hi)" sub={[`${bigText(s.total.value)} B`, `units: ${dimsText(s.total.dims)}`]} />
          <Stat label="Bandwidth at peak" value={`${bigText(b.megabitsPerSecond)} Mbit/s`} color="var(--hi)" sub={[`${bigText(b.bytesPerSecond.value / 1e6)} MB/s`, `units: ${dimsText(b.bitsPerSecond.dims)}`]} />
          <Stat label={`Share of ${NIC_GBIT} Gbit/s`} value={pctText(b.nicShare)} sub={[`link carries ${bigText(NIC_BYTES_PER_SECOND / 1e9)} GB/s: bits ÷ 8`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'an input you set' },
            { color: 'var(--hi)', label: 'a derived quantity' },
            { color: 'var(--bad)', label: 'an input that was refused' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Record size (bytes)" value={record.text} onChange={record.onChange} width={110} spellCheck={false} />
          <TextField label="Writes per day" value={writes.text} onChange={writes.onChange} width={130} spellCheck={false} />
        </>,
        <>
          <Slider label="Retention (days)" value={retention} min={1} max={3650} onChange={setRetention} />
          <Slider label="Replication factor" value={replicas} min={1} max={5} onChange={setReplicas} />
          <Slider label="Index and overhead ×" value={overhead} min={1} max={3} step={0.1} format={(v) => v.toFixed(1)} onChange={setOverhead} />
        </>,
        <>
          <Toggle label="Units" value={binary} onChange={setBinary} off="Decimal (TB = 10¹² B)" on="Binary (TiB = 2⁴⁰ B)" />
          <Slider label="Payload per request (bytes)" value={payload} min={100} max={100_000} step={100} onChange={setPayload} />
        </>,
      ]}
    >
      <div className="boe-stage stage-pad">
        <Box className="boe-strip">
          <SectionTitle hint="every result keeps its units">Unit algebra</SectionTitle>
          <p className="boe-units">
            <span className="boe-input">{bigText(record.value)}</span> B/req × <span className="boe-input">{bigText(writes.value)}</span> req/day ×{' '}
            <span className="boe-input">{retention}</span> days × <span className="boe-input">{(replicas * overhead).toFixed(1)}</span> = <b>{bigText(s.total.value)} B</b>
          </p>
          <p className="boe-units">
            <span className="boe-input">{bigText(payload)}</span> B/req × <b>{bigText(PEAK_QPS)}</b> req/s (scene 1&apos;s peak) = <b>{bigText(b.bytesPerSecond.value)} B/s</b>, × 8 bit/B = <b>{bigText(b.bitsPerSecond.value)} bit/s</b>
          </p>
          <span className="boe-mismatch" role="note">Worked example, not an error: the unit algebra refuses to add bytes to bits ({addRefusal()}).</span>
          {(record.error || writes.error) && <span className="boe-refusal" role="status">{record.error ?? writes.error} Keeping the last valid number.</span>}
        </Box>
        <div className="boe-chips">
          <Provenance kind="illustrative">record size, retention, replication and payload are made-up defaults</Provenance>
        </div>
        <Hint tone="muted" className="boe-note">Peak requests per second here is the peak from the first scene at its defaults, so nothing on this page depends on a control you can&apos;t see. Estimates are for order of magnitude.</Hint>
      </div>
    </StageFrame>
  );
}

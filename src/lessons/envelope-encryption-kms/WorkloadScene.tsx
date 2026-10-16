import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Bar } from '../../components/Bar';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { bytes, integer } from '../../core/format';
import { workloadCaption } from './captions';
import { OPENING } from './opening';
import { CALL_MS, DIRECT_LIMIT_BYTES, QUOTA_PER_SECOND, runWorkload, type WorkloadInput } from './workload';

const RATE = { min: 1, max: 2000 } as const;
const SIZE = { min: 64, max: 16_384, step: 64 } as const;
const KEY_CHOICES = [1, 10, 100, 1000] as const;

/** Scene 4: one second of traffic through direct encryption and through envelope encryption, counted call by call. */
export function WorkloadScene({ picker }: { picker: ReactNode }) {
  const [rate, setRate] = useState<number>(OPENING.workload.rate);
  const [size, setSize] = useState<number>(OPENING.workload.size);
  const [perKey, setPerKey] = useState<number>(OPENING.workload.perKey);
  const [cache, setCache] = useState(OPENING.workload.cache);

  const input = useMemo<WorkloadInput>(() => ({ recordsPerSecond: rate, recordBytes: size, recordsPerKey: perKey, cache }), [rate, size, perKey, cache]);
  const direct = useMemo(() => runWorkload('direct', input), [input]);
  const envelope = useMemo(() => runWorkload('envelope', input), [input]);
  const used = (r: typeof direct) => r.kmsCalls / QUOTA_PER_SECOND;

  return (
    <StageFrame
      height={560}
      intro={workloadCaption(direct, envelope, input.recordsPerKey)}
      introKey={`${rate}|${size}|${perKey}|${cache}`}
      stats={
        <Stats>
          <Stat label="Direct: KMS calls a second" value={direct.refused ? 'refused' : integer(direct.kmsCalls)} color={direct.refused || used(direct) > 1 ? 'var(--bad)' : undefined} sub={direct.refused ? `records over ${bytes(DIRECT_LIMIT_BYTES)}` : `${bytes(direct.kmsBytes)} sent to the KMS`}>
            <Bar value={direct.refused ? 0 : Math.min(1, used(direct))} max={1} tone={used(direct) > 1 ? 'bad' : 'info'} ariaLabel={`Direct design uses ${integer(used(direct) * 100)} percent of the illustrative quota`} />
          </Stat>
          <Stat label="Envelope: KMS calls a second" value={integer(envelope.kmsCalls)} color={used(envelope) > 1 ? 'var(--bad)' : 'var(--ok)'} sub={`${bytes(envelope.kmsBytes)} sent to the KMS`}>
            <Bar value={Math.min(1, used(envelope))} max={1} tone={used(envelope) > 1 ? 'bad' : 'ok'} ariaLabel={`Envelope design uses ${integer(used(envelope) * 100)} percent of the illustrative quota`} />
          </Stat>
          <Stat label="Waiting on the KMS" value={`${integer(envelope.kmsMs)} ms`} sub={`one after another, at ${CALL_MS} ms a call (direct: ${integer(direct.kmsMs)} ms)`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'the costly side: over quota, or refused', shape: 'square' }, { color: 'var(--ok)', label: 'the cheap side', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Records written a second" value={rate} min={RATE.min} max={RATE.max} onChange={setRate} format={integer} />
          <Slider label="Record size" value={size} min={SIZE.min} max={SIZE.max} step={SIZE.step} onChange={setSize} format={(b) => bytes(b, { iec: true })} />
        </>,
        <>
          <Segmented label="Records sharing one data key" value={perKey} options={KEY_CHOICES.map((k) => ({ value: k, label: String(k) }))} onChange={setPerKey} />
          <Toggle label="Data-key cache" value={cache} onChange={setCache} off="off" on="on" />
        </>,
      ]}
    >
      <div className="ek-stage stage-pad">
        <p className="ek-note">Each record written is read {direct.reads / direct.writes} times a second, from old data whose keys are not already in memory. Direct encryption sends every record to the KMS. Envelope encryption sends only wrapped keys, and with one record per key the call counts match: what shrinks then is the bytes. The numbers per call are made up for the comparison.</p>
        <p className="ek-note">Random 96-bit IVs also limit how many messages one key should encrypt, which is one reason to use a key per object.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">one second of traffic counted by a loop in this page; the sampled reads use a seeded generator</Provenance>
        <Provenance kind="illustrative">{CALL_MS} ms a call, a quota of {integer(QUOTA_PER_SECOND)} calls a second, and a direct payload limit of {bytes(DIRECT_LIMIT_BYTES)} are stand-in numbers</Provenance>
        <Provenance kind="from-memory">a direct KMS encrypt takes only a few kilobytes in AWS KMS, and NIST SP 800-38D bounds random-IV messages per key at 2 to the 32; check both documents</Provenance>
        <ClaimLabel kind="standard">NIST SP 800-38D is the AES-GCM recommendation; the exact limit is quoted from memory</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}

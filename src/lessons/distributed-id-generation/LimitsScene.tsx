import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { burstCaption, clockCaption, machineCaption } from './captions';
import { decodeSnowflake, MAX_MACHINE, type ClockBackPolicy, type SnowflakeEvent } from './formats';
import { BURST_LIMIT, CLOCK_RUN, runBurst, runClock, runMachines, type Attempt } from './limits';

type Hazard = 'burst' | 'clock' | 'machine';
const HAZARDS: { value: Hazard; label: string }[] = [
  { value: 'burst', label: 'A burst in one millisecond' },
  { value: 'clock', label: 'The clock goes backwards' },
  { value: 'machine', label: 'Two machines, one ID' },
];
const POLICIES: { value: ClockBackPolicy; label: string }[] = [
  { value: 'ignore', label: 'No safeguard' },
  { value: 'refuse', label: 'Refuse' },
  { value: 'wait', label: 'Wait it out' },
];
const EVENT_WORDS: Record<SnowflakeEvent, string> = {
  ok: 'next in this ms',
  'new-ms': 'new millisecond',
  'sequence-full': 'sequence full: wait',
  'clock-back-refused': 'clock went back: refused',
  'clock-back-wait': 'clock went back: waiting',
  'clock-back-ignored': 'clock went back: carried on',
};
const BURST_MIN = 1000;
const BURST_MAX = 10_000;
const TABLE_MIN_W = 460;
const HONEST = 'Simulated generators on a scripted clock: the run, the machine IDs and the burst are made up so every outcome repeats. The ID layout and the sequence rules are the real snowflake design.';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--orange)', label: 'waited, or refused: no ID this time' },
      { color: 'var(--bad)', label: 'duplicate ID' },
      { color: 'var(--info)', label: 'IDs issued in a millisecond' },
    ]}
  />
);

function idText(a: Attempt): string {
  if (a.id === null) return '–';
  const f = decodeSnowflake(a.id);
  return `ms ${f.time} · machine ${f.machine} · seq ${f.sequence}`;
}

function AttemptTable({ rows }: { rows: readonly Attempt[] }) {
  return (
    <WideRegion minWidth={TABLE_MIN_W} label="Attempts table: scroll sideways to see all of it">
      <table className="data-table idg-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Clock reads</th>
            <th scope="col">Machine</th>
            <th scope="col">What happened</th>
            <th scope="col">ID made</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{a.clock}</td>
              <td>{a.machine}</td>
              <td className={a.id === null ? 'idg-wait' : undefined}>{EVENT_WORDS[a.event]}</td>
              <td className={a.duplicate ? 'idg-dup' : undefined}>
                {idText(a)}
                {a.duplicate && ' · duplicate'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </WideRegion>
  );
}

export function LimitsScene({ picker }: { picker: ReactNode }) {
  const [hazard, setHazard] = useState<Hazard>('burst');
  const [count, setCount] = useState(5000);
  const [policy, setPolicy] = useState<ClockBackPolicy>('ignore');
  const [machineA, setMachineA] = useState(5);
  const [machineB, setMachineB] = useState(5);

  const burst = useMemo(() => runBurst(count), [count]);
  const clockRun = useMemo(() => runClock(CLOCK_RUN, 3, policy), [policy]);
  const machines = useMemo(() => runMachines(machineA, machineB, 3), [machineA, machineB]);

  const caption =
    hazard === 'burst' ? burstCaption(burst) : hazard === 'clock' ? clockCaption(policy, clockRun) : machineCaption(machineA, machineB, machines);
  useIntroCaption(caption, [hazard, count, policy, machineA, machineB]);

  const rows = hazard === 'clock' ? clockRun : machines;
  const dups = rows.filter((r) => r.duplicate).length;

  return (
    <StageFrame
      height={420}
      legend={LEGEND}
      stats={
        <Stats>
          {hazard === 'burst' ? (
            <>
              <Stat label="IDs asked for" value={count.toLocaleString('en-US')} />
              <Stat label="Waits for the next ms" value={burst.waits} color={burst.waits ? 'var(--orange)' : undefined} />
              <Stat label="Duplicates" value={burst.total - burst.unique} color="var(--ok)" />
            </>
          ) : (
            <>
              <Stat label="IDs made" value={rows.filter((r) => r.id !== null).length} sub={`of ${rows.length} attempts`} />
              <Stat label="Attempts with no ID" value={rows.filter((r) => r.id === null).length} color={rows.some((r) => r.id === null) ? 'var(--orange)' : undefined} />
              <Stat label="Duplicates" value={dups} color={dups ? 'var(--bad)' : 'var(--ok)'} />
            </>
          )}
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Hazard" value={hazard} onChange={setHazard} options={HAZARDS} />
        </>,
        hazard === 'burst' ? (
          <Slider key="b" label="IDs at once" value={count} min={BURST_MIN} max={BURST_MAX} step={500} onChange={setCount} format={(v) => v.toLocaleString('en-US')} />
        ) : hazard === 'clock' ? (
          <Segmented key="p" label="When the clock goes back" value={policy} onChange={setPolicy} options={POLICIES} />
        ) : (
          <>
            <Slider label="Machine A ID" value={machineA} min={0} max={MAX_MACHINE} onChange={setMachineA} />
            <Slider label="Machine B ID" value={machineB} min={0} max={MAX_MACHINE} onChange={setMachineB} />
          </>
        ),
      ]}
    >
      <div className="stage-pad idg">
        {hazard === 'burst' && (
          <>
            <p className="idg-note">
              The 12-bit sequence counts 0 to {BURST_LIMIT - 1} inside one millisecond, so one machine can issue {BURST_LIMIT.toLocaleString('en-US')} IDs a millisecond. The next one has to wait for the clock to tick.
            </p>
            {burst.perMs.map((p) => (
              <Bar
                key={p.time}
                value={p.count}
                max={BURST_LIMIT}
                tone="info"
                height={14}
                label={`millisecond ${p.time - burst.perMs[0].time + 1}`}
                trailing={`${p.count.toLocaleString('en-US')} IDs, seq ${p.firstSequence} to ${p.lastSequence}`}
                ariaLabel={`Millisecond ${p.time - burst.perMs[0].time + 1} held ${p.count} of ${BURST_LIMIT} IDs`}
              />
            ))}
          </>
        )}
        {hazard === 'clock' && (
          <p className="idg-note">
            A scripted run on machine 3: two IDs a millisecond, and after clock reading 104 the clock steps back to 102, as it can after a clock sync. The sequence restarts for the repeated milliseconds unless the generator guards against it.
          </p>
        )}
        {hazard === 'machine' && (
          <p className="idg-note">
            Machines A and B each make three IDs a millisecond over the same three milliseconds, reading the same clock. Only the machine ID can tell their IDs apart. Hand every machine its own: set them equal to see what goes wrong.
          </p>
        )}
        {hazard !== 'burst' && <AttemptTable rows={rows} />}
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

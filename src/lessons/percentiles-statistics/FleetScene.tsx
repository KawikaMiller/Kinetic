import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Hint, Legend, Provenance, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { plainTone } from '../../core/tone';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { fleetCaption } from './frames';
import {
  FLEET_DEFAULT, FLEET_PCT, MAX_HOSTS, MIN_HOSTS, fleetReport, presetHosts, seededHosts, type HostsMode,
} from './model';

const MODE_OPTIONS: Option<HostsMode>[] = [
  { value: 'understates', label: 'Understates (hand-made)' },
  { value: 'overstates', label: 'Overstates (hand-made)' },
  { value: 'seeded', label: 'Seeded fleet' },
];
const HOST_COUNTS: Option<number>[] = Array.from({ length: MAX_HOSTS - MIN_HOSTS + 1 }, (_, i) => ({ value: MIN_HOSTS + i, label: String(MIN_HOSTS + i) }));
const AXIS_ROOM = 1.1;

export function FleetScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<HostsMode>(FLEET_DEFAULT.mode);
  const [count, setCount] = useState(FLEET_DEFAULT.hosts);
  const [shares, setShares] = useState<number[]>([...FLEET_DEFAULT.shares]);
  const [seed, setSeed] = useState(FLEET_DEFAULT.seed);

  const hosts = useMemo(
    () => (mode === 'seeded' ? seededHosts(shares.slice(0, count), seed) : presetHosts(mode)),
    [mode, shares, count, seed],
  );
  const report = useMemo(() => fleetReport(hosts), [hosts]);
  const axisMax = Math.max(report.average ?? 0, report.merged ?? 0, report.buckets?.value ?? 0, 1) * AXIS_ROOM;

  useIntroCaption(fleetCaption(report), [report]);

  const setShare = (i: number, v: number) => setShares((s) => s.map((x, j) => (j === i ? v : x)));

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Average of host p99s" value={report.average === null ? '–' : `${sig(report.average)} ms`} color="var(--bad)" sub={[`${plural(hosts.length - report.dropped.length, 'host')} with traffic`]} />
          <Stat label="True p99, all requests" value={report.merged === null ? '–' : `${sig(report.merged)} ms`} color="var(--ok)" sub={[`${report.total.toLocaleString('en-US')} requests merged`]} />
          <Stat
            label="The gap"
            value={report.gap === null ? '–' : `${report.gap > 0 ? '+' : report.gap < 0 ? '−' : ''}${sig(Math.abs(report.gap))} ms`}
            sub={[report.gapPct === null ? 'nothing to compare' : `${report.gap! > 0 ? '+' : report.gap! < 0 ? '−' : ''}${pctText(Math.abs(report.gapPct), 0)} of the true p99`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'average of host p99s (wrong)' },
            { color: 'var(--ok)', label: 'p99 of all requests (right)' },
            { color: 'var(--violet)', label: 'p99 from merged buckets' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Fleet" value={mode} onChange={setMode} options={MODE_OPTIONS} />
        </>,
        <>
          {mode === 'seeded' ? (
            <>
              <Segmented label="Hosts" value={count} onChange={setCount} options={HOST_COUNTS} />
              <SeedField seed={seed} onSeed={setSeed} />
            </>
          ) : (
            <Hint>The two hand-made fleets are fixed request lists, so there are no shares or seed to set.</Hint>
          )}
        </>,
        ...(mode === 'seeded'
          ? [
              <>
                {shares.slice(0, count).map((share, i) => (
                  <Slider key={i} label={`Host ${report.hosts[i]?.name ?? ''} traffic`} value={share} min={0} max={100} onChange={(v) => setShare(i, v)} />
                ))}
              </>,
            ]
          : []),
      ]}
    >
      <div className="ps-stage stage-pad">
        <div className="ps-hosts">
          {report.hosts.map((h, i) => (
            <Box key={h.name} className="ps-host" style={{ '--c': `var(--${plainTone(i)})` } as CSSProperties}>
              <SectionTitle>Host {h.name}</SectionTitle>
              <b className="ps-host-p99">{h.p99 === null ? 'no requests' : `p99 ${sig(h.p99)} ms`}</b>
              <span className="ps-host-n">{h.requests.toLocaleString('en-US')} requests</span>
            </Box>
          ))}
        </div>
        {report.dropped.length > 0 && (
          <Hint className="ps-note">Host{report.dropped.length > 1 ? 's' : ''} {report.dropped.join(', ')} ha{report.dropped.length > 1 ? 've' : 's'} no traffic, so {report.dropped.length > 1 ? 'they are' : 'it is'} dropped from the average.</Hint>
        )}
        <div className="ps-bars">
          <Bar value={report.average ?? 0} max={axisMax} tone="bad" label={<span className="ps-bar-label">average of host p99s</span>} trailing={<span className="ps-bar-value">{report.average === null ? '–' : `${sig(report.average)} ms`}</span>} />
          <Bar value={report.merged ?? 0} max={axisMax} tone="ok" label={<span className="ps-bar-label">p99 of all requests</span>} trailing={<span className="ps-bar-value">{report.merged === null ? '–' : `${sig(report.merged)} ms`}</span>} />
          <Bar value={report.buckets?.value ?? 0} max={axisMax} tone="violet" label={<span className="ps-bar-label">p99 from merged buckets</span>} trailing={<span className="ps-bar-value">{report.buckets ? `${sig(report.buckets.value)} ms` : '–'}</span>} />
        </div>
        <Hint tone="muted" className="ps-note">
          Percentile used: nearest-rank, p{FLEET_PCT}. Buckets grow by a factor of 1.2 from 1 ms and merge by adding counts, so the bucket p99 is off by at most the width of its bucket.
        </Hint>
        <div className="ps-chips">
          <Provenance kind={mode === 'seeded' ? 'simulated' : 'scripted'} seed={mode === 'seeded' ? seed : undefined}>
            {mode === 'seeded' ? 'each host draws its own seeded log-normal stream (illustrative)' : 'a hand-made request list, worked out in the lesson text'}
          </Provenance>
          <Provenance kind="from-memory">real monitoring aggregates with histograms or sketches (Prometheus-style histograms, HDR histograms, t-digests); their merge rules vary by product, so check each project&apos;s docs</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}

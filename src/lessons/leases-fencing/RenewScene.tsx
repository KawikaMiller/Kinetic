import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Box, SectionTitle } from '../../components/Panel';
import { Button, Hint, Provenance, ProvenanceRow, Segmented, Slider, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { leaseFrames } from './captions';
import { OUTCOME_LABEL, PAUSE_GRID_MS, initialRenew, outcomeTable, staleCounts, validateRenew } from './init';
import { FENCE_MODES, HEARTBEAT_RANGE, MODE_LABEL, PAUSE_RANGE, TTL_RANGE_RENEW, runLease, verdictOf, type LeaseSetup } from './model';
import { LEGEND, RunPanels, RunStats } from './RunPanels';

const MODE_OPTIONS = FENCE_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }));
const PAUSE_AT_OPTIONS = [
  { value: 'job' as const, label: 'during the job' },
  { value: 'write' as const, label: 'just before the write' },
];
const PLAY_MS = 130;
const seconds = (ms: number) => `${ms / 1000} s`;

export function RenewScene({ picker }: { picker: ReactNode }) {
  const [setup, setSetup] = useState(initialRenew);
  const [refusal, setRefusal] = useState<string | null>(null);
  const heartbeat = setup.heartbeatMs ?? 0;
  const patch = (p: Partial<LeaseSetup>) => setSetup((s) => ({ ...s, ...p }));
  const run = useMemo(() => runLease(setup), [setup]);
  const verdict = useMemo(() => verdictOf(setup), [setup]);
  const frames = useMemo(() => leaseFrames(run, verdict), [run, verdict]);
  const table = useMemo(() => outcomeTable(setup), [setup]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const now = player.frame.now;

  const setTtl = (ttlMs: number) => {
    const why = validateRenew(ttlMs, heartbeat);
    setRefusal(why);
    if (why === null) patch({ ttlMs });
  };
  const setHeartbeat = (heartbeatMs: number) => {
    const why = validateRenew(setup.ttlMs, heartbeatMs);
    setRefusal(why);
    if (why === null) patch({ heartbeatMs });
  };

  return (
    <StageFrame
      height={520}
      player={player}
      stats={<RunStats run={run} now={now} verdict={verdict} />}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="Safeguard" value={setup.mode} onChange={(mode) => patch({ mode })} options={MODE_OPTIONS} />
        </>,
        <>
          <Slider label="Lease TTL" value={setup.ttlMs} min={TTL_RANGE_RENEW.min} max={TTL_RANGE_RENEW.max} step={TTL_RANGE_RENEW.step} format={seconds} onChange={setTtl} />
          <Slider label="Heartbeat every" value={heartbeat} min={HEARTBEAT_RANGE.min} max={HEARTBEAT_RANGE.max} step={HEARTBEAT_RANGE.step} format={seconds} onChange={setHeartbeat} />
          <Slider label="Pause of client A" value={setup.pauseMs} min={PAUSE_RANGE.min} max={PAUSE_RANGE.max} step={PAUSE_RANGE.step} format={seconds} onChange={(pauseMs) => patch({ pauseMs })} />
        </>,
        <>
          <Segmented label="Pause lands" value={setup.pauseAt} onChange={(pauseAt) => patch({ pauseAt })} options={PAUSE_AT_OPTIONS} />
          <Toggle label="Link to lock service" value={setup.partition} onChange={(partition) => patch({ partition })} off="Up" on="Cut for client A" />
          <Button onClick={() => { setSetup(initialRenew()); setRefusal(null); }}>Reset</Button>
          {refusal && <Hint tone="muted"><span role="status">{refusal}</span></Hint>}
        </>,
      ]}
    >
      <div className="lf-stage stage-pad">
        <RunPanels run={run} now={now} verdict={verdict} />
        <Box>
          <SectionTitle hint="every cell is a run of the simulator under the TTL, heartbeat and link above; press one to load it">Outcome by safeguard and pause</SectionTitle>
          <div className="lf-scroll" role="region" aria-label="Outcomes by safeguard and pause length" tabIndex={0}>
            <table className="data-table lf-table">
              <thead>
                <tr>
                  <th scope="col">Safeguard</th>
                  {PAUSE_GRID_MS.map((p) => (
                    <th key={p} scope="col">{p === 0 ? 'no pause' : `${p / 1000} s`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map(({ row, cells }) => (
                  <tr key={row.id}>
                    <th scope="row">{row.label}</th>
                    {cells.map((c) => {
                      const here = setup.mode === row.mode && setup.pauseAt === row.pauseAt && setup.pauseMs === c.pauseMs;
                      return (
                        <td key={c.pauseMs} className={`lf-cell is-${c.outcome}${here ? ' is-here' : ''}`}>
                          <button type="button" className="lf-cell-btn" aria-pressed={here} onClick={() => patch({ mode: row.mode, pauseAt: row.pauseAt, pauseMs: c.pauseMs })}>
                            {OUTCOME_LABEL[c.outcome]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="lf-note">{staleCounts(table)}</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={setup.seed}>the same cluster as the first scene, with client A renewing every heartbeat; each table cell is its own run</Provenance>
          <Provenance kind="illustrative">TTL, heartbeat and job lengths are made up; one box stands in for a replicated lock service</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

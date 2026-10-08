import { useMemo, useState } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { GanttLanes } from '../../components/GanttLanes';
import { GraphView } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { bootFrames, consoleFor, secText } from './frames';
import { bootRun, UNITS, type Firmware, type Scenario } from './model';
import { CHECK_STAGE, plannedEnd, stageBars, UNIT_MARK, unitView } from './view';
import './styles.css';

const STEP_MS = 1700;
const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'no-kernel', label: 'Kernel missing' },
  { value: 'no-driver', label: 'initramfs lacks disk driver' },
  { value: 'failing-service', label: 'A service fails' },
  { value: 'unsigned-kernel', label: 'Unsigned kernel' },
];
const UNIT_BOX = { w: 128, h: 34 };

export function Stage() {
  const [firmware, setFirmware] = useState<Firmware>('uefi');
  const [secureBoot, setSecureBoot] = useState(true);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const config = useMemo(() => ({ firmware, secureBoot, scenario }), [firmware, secureBoot, scenario]);
  const r = useMemo(() => bootRun(config), [config]);
  const frames = useMemo(() => bootFrames(config, r), [config, r]);
  const log = useMemo(() => consoleFor(config, r), [config, r]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { now, stage, lines } = player.frame;
  const s = r.stages[stage];
  const prev = stage > 0 ? r.stages[stage - 1] : null;
  const failed = s.status === 'failed' && now >= s.end;
  const sb = firmware === 'uefi' && secureBoot;
  const systemd = r.stages.find((x) => x.info.id === 'systemd')!;
  const showUnits = r.units !== null && now >= systemd.start;
  const unitT = now - systemd.start;
  const unitsDone = r.units !== null && now >= systemd.end;

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Boot clock" value={secText(now)} sub="illustrative" />
          <Stat label="In control" value={s.info.control} color={failed ? 'var(--bad)' : 'var(--hi)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'stage in control / unit starting' },
            { color: 'var(--sky)', label: 'finished stage' },
            { color: 'var(--amber)', label: 'finished stage (alternate)' },
            { color: 'var(--violet)', label: 'handoff', shape: 'line' },
            { color: 'var(--ok)', label: 'signature verified / unit started' },
            { color: 'var(--bad)', label: 'failed stage' },
            { color: 'var(--orange)', label: 'failed unit, boot continues' },
            { color: 'var(--dim)', label: 'not reached / skipped' },
          ]}
        />
      }
      controls={[
        <>
          <Toggle label="Firmware" value={firmware === 'bios'} onChange={(v) => setFirmware(v ? 'bios' : 'uefi')} off="UEFI" on="Legacy BIOS" />
          {firmware === 'uefi' ? <Toggle label="Secure Boot" value={secureBoot} onChange={setSecureBoot} /> : <Hint>Secure Boot needs UEFI</Hint>}
        </>,
        <Segmented key="scenario" label="Scenario" value={scenario} onChange={setScenario} options={SCENARIOS} />,
      ]}
    >
      <div className="bp stage-pad">
        <div className="bp-chips" aria-live="off">
          {s.info.id === 'login' ? (
            <span className="bp-handoff">systemd stays PID 1; getty is one of its units</span>
          ) : prev && prev.status === 'ok' && (
            <span className="bp-handoff">
              {prev.info.control} <i aria-hidden="true">⟶</i> {s.info.control}
            </span>
          )}
          <span className={`chip ${failed ? 'tone-bad' : 'tone-hi'}`}>in control: {s.info.control}</span>
          <span className="chip tone-muted">code from: {s.info.from}</span>
        </div>
        <WideRegion minWidth={480} label="Boot timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={r.stages.map((x) => ({ id: x.info.id, label: x.info.name }))}
            bars={stageBars(r, now, stage)}
            domain={[0, plannedEnd(r)]}
            now={now}
            axis
            unit=" ms"
            size="md"
            labelWidth={132}
            ariaLabel={`Boot timeline at ${secText(now)}`}
          />
        </WideRegion>
        {sb && (
          <ul className="bp-checks" aria-label="Secure Boot signature checks">
            {r.verifications.map((v, i) => {
              const shown = stage >= CHECK_STAGE[i];
              return (
                <li key={v.what} className={!shown || v.status === 'not-reached' ? 'is-pending' : v.status === 'ok' ? 'is-ok' : 'is-bad'}>
                  {!shown || v.status === 'not-reached' ? '·' : v.status === 'ok' ? '✓' : '✗'} {v.by} checks {v.what}
                  {shown && v.status === 'failed' ? ': refused' : shown && v.status === 'not-reached' ? ': nothing to check' : ''}
                </li>
              );
            })}
          </ul>
        )}
        <div className="bp-row">
          <div className="bp-col bp-grow">
            <SectionTitle>systemd units {r.units === null ? '(never ran)' : unitsDone ? '(done)' : showUnits ? `(${secText(unitT)} into systemd)` : '(not started yet)'}</SectionTitle>
            <WideRegion minWidth={560} label="Unit graph: scroll sideways to see all of it">
              <GraphView
                nodes={UNITS.map((u) => ({ id: u.id, label: u.id, shape: 'box' as const }))}
                edges={UNITS.flatMap((u) => u.after.map((d) => ({ from: d, to: u.id })))}
                directed
                layout="layered"
                spacing={{ direction: 'right', layerGap: 150, nodeGap: 44, padMain: 72, padCross: 26 }}
                box={UNIT_BOX}
                edgeStyle="curve"
                className="bp-units"
                nodeMark={(id) => {
                  if (!showUnits) return null;
                  const u = r.units!.find((x) => x.id === id)!;
                  return UNIT_MARK[unitView(u, unitT)];
                }}
                ariaLabel="systemd unit dependency graph: an arrow means the unit on the right starts after the one on the left"
              />
            </WideRegion>
          </div>
          <div className="bp-col">
            <SectionTitle>systemd-analyze blame</SectionTitle>
            {unitsDone ? (
              <table className="data-table bp-blame">
                <tbody>
                  {[...r.units!]
                    .filter((u) => u.end > u.start)
                    .sort((a, b) => b.end - b.start - (a.end - a.start))
                    .map((u) => (
                      <tr key={u.id} className={u.state === 'failed' ? 'is-failed' : ''}>
                        <td>{secText(u.end - u.start)}</td>
                        <td>{u.id}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-note">{r.units === null ? 'systemd never ran' : 'shown once systemd is done'}</p>
            )}
          </div>
        </div>
        <ConsolePanel lines={log.slice(0, lines).map((l) => (l.tone ? { text: l.text, tone: l.tone } : l.text))} title="boot messages (illustrative)" empty="(screen still blank)" />
        <Hint block>
          A typical Linux on UEFI with GRUB; timings and messages are illustrative, and firmware and distributions differ. A VM goes through this same chain with virtual firmware. A
          container skips all of it: it is a process started on a kernel that has already booted, which is why it starts in milliseconds.
        </Hint>
      </div>
    </StageFrame>
  );
}

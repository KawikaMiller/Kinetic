import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { GraphView } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { barAt } from '../../core/gantt';
import { plural } from '../../core/format';
import { releaseCaption } from './captions';
import {
  CHANGES, CONSUMER_RANGE, LIB, SYSTEM, changeOf, monorepo, pinsAt, polyrepo, versionsInUse, currentVersion, type Change, type ChangeId, type Pin,
} from './release';

type Mode = 'monorepo' | 'polyrepo';

const GANTT_MIN_WIDTH = 480;
const STATE_WORD: Record<Pin['state'], string> = { library: 'released', moved: 'moved', waiting: 'on the old version', unaffected: 'no change needed' };

/** The most library versions in use at once on any day of the transition. */
function peakVersions(change: Change): number {
  const days = polyrepo(change).days;
  return Math.max(1, ...Array.from({ length: days + 1 }, (_, d) => versionsInUse(pinsAt(change, d))));
}

export function ReleaseScene({ picker }: { picker: ReactNode }) {
  const [changeId, setChangeId] = useState<ChangeId>('rename');
  const [mode, setMode] = useState<Mode>('monorepo');
  const [callersUpdated, setCallersUpdated] = useState(true);
  const [day, setDay] = useState(0);
  const setCaption = useSetCaption();
  const change = changeOf(changeId);
  const mono = useMemo(() => monorepo(change, callersUpdated), [change, callersUpdated]);
  const poly = useMemo(() => polyrepo(change), [change]);
  const shownDay = Math.min(day, poly.days);
  const pins = pinsAt(change, shownDay);

  useEffect(() => {
    setCaption(releaseCaption(changeId, mode, callersUpdated, shownDay), { quiet: true });
  }, [setCaption, changeId, mode, callersUpdated, shownDay]);

  const nodeMark = (id: string) => {
    if (id === LIB) return { tone: 'hi' as const, fill: 'solid' as const };
    if (mode === 'monorepo') return mono.failing.includes(id) ? { tone: 'bad' as const, fill: 'tint' as const } : { tone: 'orange' as const, fill: 'tint' as const };
    const pin = pins.find((p) => p.repo === id)!;
    if (pin.state === 'moved') return { tone: 'ok' as const, fill: 'tint' as const };
    return pin.state === 'waiting' ? { tone: 'info' as const, fill: 'tint' as const } : { tone: 'dim' as const, fill: 'tint' as const, tint: 8 };
  };

  const bars: GanttBar[] = poly.rows.map((r) => {
    const bar: GanttBar = { id: r.repo, lane: r.repo, start: r.slot.start, end: r.slot.finish, tone: r.slot.finish <= shownDay ? 'ok' : 'info', label: r.repo };
    return barAt(bar, shownDay) ?? { ...bar, progress: 0 };
  });
  const status = mode === 'monorepo' ? mono.status : poly.prs === 0 ? 'landed' : pins.every((p) => p.state !== 'waiting') ? 'landed' : 'pending';
  const statusTone = status === 'landed' ? 'var(--ok)' : status === 'blocked' ? 'var(--bad)' : 'var(--info)';

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Changes to review" value={mode === 'monorepo' ? mono.prs : poly.prs} sub={mode === 'monorepo' ? 'one commit, atomic' : 'one per repository, in order'} />
          <Stat
            label="Calendar days"
            value={mode === 'monorepo' ? mono.days : poly.days}
            sub={mode === 'monorepo' ? 'one review thread' : poly.prs === 0 ? 'nothing to schedule' : 'the longest chain of waiting'}
          />
          <Stat label="Library versions in use" value={mode === 'monorepo' ? 1 : peakVersions(change)} sub={mode === 'monorepo' ? 'one tree' : 'at the worst moment'} color={mode === 'polyrepo' && peakVersions(change) > 1 ? 'var(--orange)' : undefined} />
          <Stat label="Status" value={status} color={statusTone} sub={mode === 'monorepo' ? `CI builds ${plural(mono.affected.length, 'package')}` : `day ${shownDay}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the changed package', shape: 'square' },
            { color: 'var(--orange)', label: 'affected: CI builds it', shape: 'square' },
            { color: 'var(--ok)', label: 'landed or moved', shape: 'square' },
            { color: 'var(--bad)', label: 'blocked: fails to build', shape: 'square' },
            { color: 'var(--info)', label: 'pending', shape: 'square' },
            { color: 'var(--dim)', label: 'untouched', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Change to shared-lib">
            {CHANGES.map((c) => (
              <ChipButton key={c.id} tone="info" on={c.id === changeId} onClick={() => setChangeId(c.id)}>
                {c.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Toggle label="Repository layout" value={mode === 'polyrepo'} onChange={(p) => setMode(p ? 'polyrepo' : 'monorepo')} off="Monorepo" on="Polyrepo" />
          {mode === 'monorepo' && !change.compatible && (
            <Toggle label="Callers in the same commit" value={callersUpdated} onChange={setCallersUpdated} off="not updated" on="updated" />
          )}
          {mode === 'polyrepo' && poly.days > 0 && (
            <Slider label="Day after release" value={shownDay} min={0} max={poly.days} onChange={setDay} format={(v) => `day ${v}`} />
          )}
        </>,
      ]}
    >
      <div className="mp stage-pad">
        <div className="mp-graph">
          <GraphView
            nodes={SYSTEM.nodes.map((id) => ({ id, shape: 'box' as const, label: id }))}
            edges={SYSTEM.nodes.flatMap((to) => SYSTEM.deps[to].map((from) => ({ from, to })))}
            directed
            layout="layered"
            spacing={{ direction: 'right', layerGap: 150, nodeGap: 42, padMain: 40, padCross: 24 }}
            box={{ w: 104, h: 34 }}
            ariaLabel={`Invented system: ${SYSTEM.nodes.length - 1} packages that depend on ${LIB}; arrows point from a dependency to what uses it`}
            nodeMark={nodeMark}
          />
        </div>
        {mode === 'polyrepo' && poly.prs > 0 && (
          <>
            <WideRegion minWidth={GANTT_MIN_WIDTH} label="Cascade timeline: scroll sideways to see all of it">
              <GanttLanes
                lanes={poly.rows.map((r) => ({ id: r.repo, label: r.repo }))}
                bars={bars}
                domain={[0, poly.days]}
                now={shownDay}
                unit=" d"
                axis
                size="md"
                labelWidth={80}
                ariaLabel="Days each repository takes to move to the new library version, in dependency order"
              />
            </WideRegion>
          </>
        )}
        {mode === 'polyrepo' && (
          <Box className="mp-skew">
            <SectionTitle hint={`${LIB} ${poly.version}; callers pin ${CONSUMER_RANGE}`}>Version skew on day {shownDay}</SectionTitle>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>{LIB}</th>
                  <th>State</th>
                  <th>Needs a code change</th>
                </tr>
              </thead>
              <tbody>
                {pins.map((p) => (
                  <tr key={p.repo}>
                    <td>{p.repo}</td>
                    <td>{p.version}</td>
                    <td className={p.state === 'moved' ? 'mp-ok' : p.state === 'waiting' ? 'mp-pending' : ''}>{STATE_WORD[p.state]}</td>
                    <td>{p.state === 'library' || p.state === 'unaffected' ? '–' : poly.rows.find((r) => r.repo === p.repo)?.codeChange ? 'yes' : 'bump only'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Hint block>
              Before the release every repository pins {currentVersion()}. web depends on api too, so in this model it waits for api: moving first can leave web seeing two library majors.
            </Hint>
          </Box>
        )}
        {mode === 'monorepo' && (
          <Box className="mp-skew">
            <SectionTitle hint="the packages CI builds for this change">Affected set</SectionTitle>
            <p className="mp-note">
              {mono.affected.join(', ')}. In a monorepo the callers change in the commit that changes the library, so there is no moment with two versions.
            </p>
          </Box>
        )}
        <div className="mp-notes">
          <Provenance kind="invented">an invented system, review times and library versions</Provenance>
          <ClaimLabel kind="standard">a compatible addition is a minor release and a breaking change a major one, under semantic versioning</ClaimLabel>
          <ClaimLabel kind="practice">tools commonly run CI on the packages that can reach a change</ClaimLabel>
        </div>
      </div>
    </StageFrame>
  );
}

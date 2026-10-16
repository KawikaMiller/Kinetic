import { useMemo, useState, type ReactNode } from 'react';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { plural } from '../../core/format';
import { plainTone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { NAMES, roomFrames } from './frames';
import { IntervalControls } from './IntervalControls';
import type { TieRule } from './intervals';
import { OPENING, ROOMS_PRESETS } from './presets';
import { Timeline } from './Timeline';
import { useIntervals } from './useIntervals';

const STEP_MS = 800;

/** Scene 2: every interval is two events; the counter's maximum is the number of rooms, and the tie rule is the bug. */
export function RoomsScene({ picker }: { picker: ReactNode }) {
  const state = useIntervals(OPENING.rooms);
  const [tie, setTie] = useState<TieRule>('end-first');
  const [view, setView] = useState<'events' | 'rooms'>('events');
  const run = useMemo(() => roomFrames(state.intervals, tie), [state.intervals, tie]);
  const player = usePlayer(run.frames, { interval: STEP_MS });
  const f = player.frame;
  const live = new Set(f.live);
  const rooms = run.rooms;
  const agree = run.max === rooms.rooms;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Active now" value={f.active} color={f.over ? 'var(--bad)' : 'var(--hi)'} sub={f.over ? 'overcount at this event' : 'intervals live at the sweep line'} />
          <Stat label="Maximum so far" value={f.max} color="var(--hi)" sub={`${run.max} when finished, this tie rule`} />
          <Stat label="Rooms (heap greedy)" value={rooms.rooms} color="var(--ok)" sub={agree ? `equals the maximum overlap, ${run.max}` : `the maximum says ${run.max}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'live at the sweep line', shape: 'square' },
            { color: 'var(--dim)', label: 'not live', shape: 'square' },
            { color: 'var(--hi)', label: 'sweep line', shape: 'line' },
            { color: 'var(--bad)', label: 'overcount from the bad tie order', shape: 'square' },
            { color: 'var(--amber)', label: 'rooms (one tone each in the rooms view)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Tie rule at equal times" value={tie === 'start-first'} onChange={(b) => setTie(b ? 'start-first' : 'end-first')} off="End before start" on="Start before end (bug)" />
          <Segmented label="View" value={view} onChange={setView} options={[{ value: 'events', label: 'Events' }, { value: 'rooms', label: 'Room assignment' }]} />
        </>,
        <IntervalControls key="intervals" state={state} presets={ROOMS_PRESETS} />,
      ]}
    >
      <div className="sw-stage stage-pad">
        {view === 'events' ? (
          <Timeline
            intervals={state.intervals}
            tone={(i) => (live.has(i) ? (f.over ? 'bad' : 'info') : 'dim')}
            now={f.now}
            onDrag={state.drag}
            ariaLabel="Meetings as bars with the sweep line"
          />
        ) : (
          <Timeline
            intervals={state.intervals}
            lanes={rooms.room}
            laneCount={rooms.rooms}
            tone={(i) => plainTone(rooms.room[i])}
            ariaLabel={`${plural(rooms.rooms, 'room')}, each meeting in its room`}
          />
        )}
        <Tray label="Events in order" labelWeight="regular" empty="no events" ariaLabel="Events">
          {run.events.map((e, k) => (
            <span key={k} className={`sw-event${k === f.at ? ' is-now' : ''}${e.over ? ' is-bad' : ''}`}>
              {e.time} {NAMES[e.id]} {e.kind === 'start' ? '+1' : '-1'} = {e.active}
            </span>
          ))}
        </Tray>
        <p className="sw-note">
          {view === 'rooms' ? `Each meeting sits in its room: ${plural(rooms.rooms, 'room')}, and the most meetings live at once is ${run.max} with this tie rule.` : 'Half-open meetings that merely touch can share a room, so at an equal time the end must be taken off before the next start is counted. With closed intervals the other order is right: [9, 10] and [10, 11] do share the instant 10, so counting the start first gives the correct 3 there. The tie rule is a bug only under the half-open convention.'}
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every count is computed from the intervals as drawn</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

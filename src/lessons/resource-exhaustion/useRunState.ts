import { useState } from 'react';
import { useInterval } from '../../core/useInterval';
import { DEFAULT_LEAKS, DEFAULT_RPS, MAX_HOURS, type AlertSet, type GaugeId, type LeakId, type Load } from './model';

/** Hours of the run that pass per tick while playing, and how often it ticks. */
const PLAY_STEP_HOURS = 0.5;
const PLAY_TICK_MS = 120;
/** Where the clock starts: just after the inode limit of the default leaks, so the first look is an incident. */
const START_HOURS = 20;

export interface RunState {
  load: Load;
  hours: number;
  alerts: AlertSet;
  playing: boolean;
  toggleLeak: (id: LeakId) => void;
  setRps: (rps: number) => void;
  setHours: (h: number) => void;
  toggleAlert: (id: GaugeId) => void;
  setAlerts: (ids: readonly GaugeId[]) => void;
  setPlaying: (on: boolean) => void;
}

/** The leaks, traffic, clock and alerts that the gauges and cascade scenes share, so switching scene keeps your experiment. */
export function useRunState(): RunState {
  const [leaks, setLeaks] = useState<ReadonlySet<LeakId>>(new Set(DEFAULT_LEAKS));
  const [rps, setRps] = useState(DEFAULT_RPS);
  const [hours, setHours] = useState(START_HOURS);
  const [alerts, setAlertSet] = useState<AlertSet>(new Set());
  const [playing, setPlaying] = useState(false);

  useInterval(
    () => {
      if (hours >= MAX_HOURS) setPlaying(false);
      else setHours(Math.min(MAX_HOURS, hours + PLAY_STEP_HOURS));
    },
    PLAY_TICK_MS,
    playing,
  );

  const toggle = <T,>(set: ReadonlySet<T>, id: T) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };
  return {
    load: { leaks, rps },
    hours,
    alerts,
    playing,
    toggleLeak: (id) => setLeaks((s) => toggle(s, id)),
    setRps,
    setHours,
    toggleAlert: (id) => setAlertSet((s) => toggle(s, id)),
    setAlerts: (ids) => setAlertSet(new Set(ids)),
    setPlaying,
  };
}

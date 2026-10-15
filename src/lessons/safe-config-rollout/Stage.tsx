import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import type { ChangeId } from './model';
import { DEFAULT_PLAN, type PlanState } from './plan';
import { RolloutScene } from './RolloutScene';
import { ScheduleScene } from './ScheduleScene';
import { DEFAULT_START_HOUR } from './schedule';
import './styles.css';

const SCENES = [
  { value: 'all', label: 'Everything at once' },
  { value: 'staged', label: 'Staged' },
  { value: 'schedule', label: 'The schedule' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'all' });
  const [change, setChange] = useState<ChangeId>('crash');
  const [state, setState] = useState<PlanState>(DEFAULT_PLAN);
  const [startHour, setStartHour] = useState(DEFAULT_START_HOUR);
  if (scene === 'staged') return <RolloutScene picker={picker} staged change={change} onChange={setChange} state={state} onState={setState} />;
  if (scene === 'schedule') return <ScheduleScene picker={picker} change={change} onChange={setChange} state={state} startHour={startHour} onStartHour={setStartHour} />;
  return <RolloutScene picker={picker} staged={false} change={change} onChange={setChange} state={state} onState={setState} />;
}

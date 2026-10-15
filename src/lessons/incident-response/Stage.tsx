import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { startWalk, type Walk } from '../../core/scenario';
import { OutcomeScene } from './OutcomeScene';
import { ReplayScene } from './ReplayScene';
import { ResponseScene } from './ResponseScene';
import { SCENARIOS, type Cause } from './model';
import './styles.css';

const SCENES = [
  { value: 'respond', label: 'You are on call' },
  { value: 'replay', label: 'Timeline replay' },
  { value: 'outcomes', label: 'Every first move' },
] as const;

const DEFAULT_CAUSE: Cause = 'deploy';

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'respond' });
  const [cause, setCause] = useState<Cause>(DEFAULT_CAUSE);
  const [walk, setWalk] = useState<Walk>(() => startWalk(SCENARIOS[DEFAULT_CAUSE]));
  const changeCause = (c: Cause) => {
    setCause(c);
    setWalk(startWalk(SCENARIOS[c]));
  };
  if (scene === 'replay') return <ReplayScene picker={picker} cause={cause} walk={walk} />;
  if (scene === 'outcomes') return <OutcomeScene picker={picker} cause={cause} walk={walk} />;
  return <ResponseScene picker={picker} cause={cause} onCause={changeCause} walk={walk} onWalk={setWalk} />;
}

import { useScenePicker } from '../../components/ScenePicker';
import { DelayScene } from './DelayScene';
import { DriftScene } from './DriftScene';
import { FalseScene } from './FalseScene';
import { GateScene } from './GateScene';
import { LeakScene } from './LeakScene';
import { type SceneId } from './settings';
import './styles.css';

const SCENE_OPTIONS: { value: SceneId; label: string }[] = [
  { value: 'drift', label: 'Drift' },
  { value: 'delay', label: 'Labels arrive late' },
  { value: 'false', label: 'False alarms' },
  { value: 'gate', label: 'The eval gate' },
  { value: 'leak', label: 'Leakage' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENE_OPTIONS, initial: 'drift' });
  if (scene === 'delay') return <DelayScene key={scene} picker={picker} />;
  if (scene === 'false') return <FalseScene key={scene} picker={picker} />;
  if (scene === 'gate') return <GateScene key={scene} picker={picker} />;
  if (scene === 'leak') return <LeakScene key={scene} picker={picker} />;
  return <DriftScene key={scene} picker={picker} />;
}

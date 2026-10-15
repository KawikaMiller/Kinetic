import { useScenePicker } from '../../components/ScenePicker';
import { LevelScene } from './LevelScene';
import { LiveScene } from './LiveScene';
import './styles.css';

const SCENES = [
  { value: 'loop', label: 'The loop' },
  { value: 'drift', label: 'Drift' },
  { value: 'trap', label: 'The incident trap' },
  { value: 'level', label: 'Level-triggered' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'loop' });
  if (scene === 'level') return <LevelScene picker={picker} />;
  return <LiveScene key={scene} picker={picker} mode={scene} />;
}

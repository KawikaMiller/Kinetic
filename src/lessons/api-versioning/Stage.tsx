import { useScenePicker } from '../../components/ScenePicker';
import { ChangeScene } from './ChangeScene';
import { StrategyScene } from './StrategyScene';
import { SunsetScene } from './SunsetScene';
import './styles.css';

type SceneId = 'change' | 'strategy' | 'sunset';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'change', label: 'Change the API' },
  { value: 'strategy', label: 'Versioning strategies' },
  { value: 'sunset', label: 'Deprecation and sunset' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'change' });
  if (scene === 'strategy') return <StrategyScene picker={picker} />;
  if (scene === 'sunset') return <SunsetScene picker={picker} />;
  return <ChangeScene picker={picker} />;
}

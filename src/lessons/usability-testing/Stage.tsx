import { useScenePicker } from '../../components/ScenePicker';
import { CurveScene } from './CurveScene';
import { MethodsScene } from './MethodsScene';
import { SessionsScene } from './SessionsScene';
import './styles.css';

type Scene = 'sessions' | 'curve' | 'methods';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'sessions', label: 'Sessions' },
  { value: 'curve', label: 'How many users' },
  { value: 'methods', label: 'Which method' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'sessions' });
  if (scene === 'sessions') return <SessionsScene picker={picker} />;
  if (scene === 'curve') return <CurveScene picker={picker} />;
  return <MethodsScene picker={picker} />;
}

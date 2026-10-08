import { useScenePicker } from '../../components/ScenePicker';
import { FindScene } from './FindScene';
import { LevelsScene } from './LevelsScene';
import { RedactScene } from './RedactScene';
import './styles.css';

type Scene = 'find' | 'levels' | 'redact';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'find', label: 'Find the request' },
      { value: 'levels', label: 'Levels and cost' },
      { value: 'redact', label: 'What not to log' },
    ],
    initial: 'find',
  });
  if (scene === 'levels') return <LevelsScene picker={picker} />;
  if (scene === 'redact') return <RedactScene picker={picker} />;
  return <FindScene picker={picker} />;
}

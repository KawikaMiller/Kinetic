import { useScenePicker } from '../../components/ScenePicker';
import { FailureScene } from './FailureScene';
import { NeedsScene } from './NeedsScene';
import { RenewScene } from './RenewScene';
import './styles.css';

type Scene = 'failure' | 'renew' | 'needs';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'failure', label: 'The failure and the fix' },
  { value: 'renew', label: 'Renewals and TTL' },
  { value: 'needs', label: 'What fencing needs' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'failure' });
  if (scene === 'renew') return <RenewScene key={scene} picker={picker} />;
  if (scene === 'needs') return <NeedsScene key={scene} picker={picker} />;
  return <FailureScene key={scene} picker={picker} />;
}

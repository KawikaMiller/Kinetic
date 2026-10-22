import { useScenePicker } from '../../components/ScenePicker';
import { ExpiryScene } from './ExpiryScene';
import { MitigationScene } from './MitigationScene';
import { SingleflightScene } from './SingleflightScene';
import './styles.css';

type Scene = 'expiry' | 'mitigations' | 'singleflight';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'expiry', label: 'The expiry' },
  { value: 'mitigations', label: 'The mitigations' },
  { value: 'singleflight', label: 'A broken singleflight' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'expiry' });
  if (scene === 'mitigations') return <MitigationScene key={scene} picker={picker} />;
  if (scene === 'singleflight') return <SingleflightScene key={scene} picker={picker} />;
  return <ExpiryScene key={scene} picker={picker} />;
}

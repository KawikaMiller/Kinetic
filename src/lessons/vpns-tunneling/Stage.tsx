import { useScenePicker } from '../../components/ScenePicker';
import { KeysScene } from './KeysScene';
import { MtuScene } from './MtuScene';
import { RoutesScene } from './RoutesScene';
import { WrapScene } from './WrapScene';
import './styles.css';

type Scene = 'wrap' | 'mtu' | 'routes' | 'keys';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'wrap', label: 'Wrap a packet' },
  { value: 'mtu', label: 'MTU and the black hole' },
  { value: 'routes', label: 'What enters the tunnel' },
  { value: 'keys', label: 'Keys and replay' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'wrap' });
  if (scene === 'mtu') return <MtuScene key={scene} picker={picker} />;
  if (scene === 'routes') return <RoutesScene key={scene} picker={picker} />;
  if (scene === 'keys') return <KeysScene key={scene} picker={picker} />;
  return <WrapScene key={scene} picker={picker} />;
}

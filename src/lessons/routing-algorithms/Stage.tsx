import { useScenePicker } from '../../components/ScenePicker';
import { DvScene } from './DvScene';
import { ForwardScene } from './ForwardScene';
import { LsScene } from './LsScene';
import './styles.css';

type Scene = 'forward' | 'dv' | 'ls';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'forward', label: 'Forwarding' },
  { value: 'dv', label: 'Distance vector' },
  { value: 'ls', label: 'Link state' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'forward' });
  if (scene === 'dv') return <DvScene key={scene} picker={picker} />;
  if (scene === 'ls') return <LsScene key={scene} picker={picker} />;
  return <ForwardScene key={scene} picker={picker} />;
}

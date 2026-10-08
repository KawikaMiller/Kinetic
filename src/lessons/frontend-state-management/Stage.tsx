import { useScenePicker } from '../../components/ScenePicker';
import { DerivedScene } from './DerivedScene';
import { RenderScene } from './RenderScene';
import { ServerScene } from './ServerScene';
import './styles.css';

type Scene = 'render' | 'server' | 'derived';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'render', label: 'Who re-renders' },
  { value: 'server', label: 'Server state' },
  { value: 'derived', label: 'Derived state' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'render' });
  if (scene === 'render') return <RenderScene picker={picker} />;
  if (scene === 'server') return <ServerScene picker={picker} />;
  return <DerivedScene picker={picker} />;
}

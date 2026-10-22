import { useScenePicker } from '../../components/ScenePicker';
import { ControlScene } from './ControlScene';
import { HealthScene } from './HealthScene';
import { MeshScene } from './MeshScene';
import { RegistryScene } from './RegistryScene';
import './styles.css';

type Scene = 'registry' | 'health' | 'mesh' | 'control';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'registry', label: 'A registry' },
  { value: 'health', label: 'Health feeds the registry' },
  { value: 'mesh', label: 'Add a mesh' },
  { value: 'control', label: 'The control plane goes down' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'registry' });
  if (scene === 'health') return <HealthScene key={scene} picker={picker} />;
  if (scene === 'mesh') return <MeshScene key={scene} picker={picker} />;
  if (scene === 'control') return <ControlScene key={scene} picker={picker} />;
  return <RegistryScene key={scene} picker={picker} />;
}

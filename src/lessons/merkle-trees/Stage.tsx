import { useScenePicker } from '../../components/ScenePicker';
import { BuildScene } from './BuildScene';
import { ProofScene } from './ProofScene';
import { SyncScene } from './SyncScene';
import { ToyScene } from './ToyScene';
import './styles.css';

type Scene = 'build' | 'sync' | 'proof' | 'toy';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'build', label: 'Build one' },
  { value: 'sync', label: 'Anti-entropy' },
  { value: 'proof', label: 'Inclusion proof' },
  { value: 'toy', label: 'A toy that fails' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'build' });
  if (scene === 'sync') return <SyncScene key={scene} picker={picker} />;
  if (scene === 'proof') return <ProofScene key={scene} picker={picker} />;
  if (scene === 'toy') return <ToyScene key={scene} picker={picker} />;
  return <BuildScene key={scene} picker={picker} />;
}

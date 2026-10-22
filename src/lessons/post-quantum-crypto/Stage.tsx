import { useScenePicker } from '../../components/ScenePicker';
import { HybridScene } from './HybridScene';
import { LatticeScene } from './LatticeScene';
import { LweScene } from './LweScene';
import { MoscaScene } from './MoscaScene';
import { ShorScene } from './ShorScene';
import './styles.css';

type Scene = 'mosca' | 'shor' | 'lwe' | 'lattice' | 'hybrid';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'mosca', label: 'Who needs to worry now' },
  { value: 'shor', label: 'What Shor changes' },
  { value: 'lwe', label: 'A toy lattice scheme' },
  { value: 'lattice', label: 'Two bases' },
  { value: 'hybrid', label: 'Hybrid key exchange' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'mosca' });
  if (scene === 'shor') return <ShorScene key="shor" picker={picker} />;
  if (scene === 'lwe') return <LweScene key="lwe" picker={picker} />;
  if (scene === 'lattice') return <LatticeScene key="lattice" picker={picker} />;
  if (scene === 'hybrid') return <HybridScene key="hybrid" picker={picker} />;
  return <MoscaScene key="mosca" picker={picker} />;
}

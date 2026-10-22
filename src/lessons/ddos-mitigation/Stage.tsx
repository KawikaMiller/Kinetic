import { useScenePicker } from '../../components/ScenePicker';
import { OriginScene } from './OriginScene';
import { PopsScene } from './PopsScene';
import { SynScene } from './SynScene';
import './styles.css';

type Scene = 'origin' | 'pops' | 'syn';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'origin', label: 'What runs out' },
  { value: 'pops', label: 'Absorb or filter' },
  { value: 'syn', label: 'SYN cookies' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'origin' });
  if (scene === 'pops') return <PopsScene key={scene} picker={picker} />;
  if (scene === 'syn') return <SynScene key={scene} picker={picker} />;
  return <OriginScene key={scene} picker={picker} />;
}

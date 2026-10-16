import { useScenePicker } from '../../components/ScenePicker';
import { SwitchScene } from './SwitchScene';
import { TlbScene } from './TlbScene';
import { WalkScene } from './WalkScene';
import './styles.css';

type Scene = 'walk' | 'tlb' | 'switch';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'walk', label: 'The four-level walk' },
  { value: 'tlb', label: 'The TLB' },
  { value: 'switch', label: 'Switches and shootdowns' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'walk' });
  if (scene === 'tlb') return <TlbScene key={scene} picker={picker} />;
  if (scene === 'switch') return <SwitchScene key={scene} picker={picker} />;
  return <WalkScene key={scene} picker={picker} />;
}

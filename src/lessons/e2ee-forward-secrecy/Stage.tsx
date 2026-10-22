import { useScenePicker } from '../../components/ScenePicker';
import { ChainScene } from './ChainScene';
import { HealScene } from './HealScene';
import { RelayScene } from './RelayScene';
import './styles.css';

type Scene = 'chain' | 'heal' | 'relay';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'chain', label: 'The chain' },
  { value: 'heal', label: 'Healing' },
  { value: 'relay', label: 'The relay' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'chain' });
  if (scene === 'heal') return <HealScene key="heal" picker={picker} />;
  if (scene === 'relay') return <RelayScene key="relay" picker={picker} />;
  return <ChainScene key="chain" picker={picker} />;
}

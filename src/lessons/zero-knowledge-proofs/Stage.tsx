import { useScenePicker } from '../../components/ScenePicker';
import { CaveScene } from './CaveScene';
import { FiatScene } from './FiatScene';
import { SchnorrScene } from './SchnorrScene';
import { ZkScene } from './ZkScene';
import './styles.css';

type Scene = 'cave' | 'proof' | 'zk' | 'fiat';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'cave', label: 'The cave' },
  { value: 'proof', label: 'A working proof' },
  { value: 'zk', label: 'Zero knowledge, by exhaustion' },
  { value: 'fiat', label: 'One message' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'cave' });
  if (scene === 'proof') return <SchnorrScene key="proof" picker={picker} />;
  if (scene === 'zk') return <ZkScene key="zk" picker={picker} />;
  if (scene === 'fiat') return <FiatScene key="fiat" picker={picker} />;
  return <CaveScene key="cave" picker={picker} />;
}

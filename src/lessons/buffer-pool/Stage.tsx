import { useScenePicker } from '../../components/ScenePicker';
import { PoolScene } from './PoolScene';
import { SizeScene } from './SizeScene';
import { usePoolState } from './usePoolState';
import './styles.css';

type Scene = 'hot' | 'scan' | 'pins' | 'size';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'hot', label: 'A hot set' },
  { value: 'scan', label: 'The scan pollutes the pool' },
  { value: 'pins', label: 'Pins and dirty pages' },
  { value: 'size', label: 'Size it' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'hot' });
  const st = usePoolState();
  if (scene === 'size') return <SizeScene picker={picker} seed={st.seed} setSeed={st.setSeed} skew={st.skew} setSkew={st.setSkew} />;
  return <PoolScene scene={scene} st={st} picker={picker} />;
}

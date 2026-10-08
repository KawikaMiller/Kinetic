import { useScenePicker } from '../../components/ScenePicker';
import { PoolScene } from './PoolScene';
import { SpectrumScene } from './SpectrumScene';
import './styles.css';

type Scene = 'spectrum' | 'pool';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'spectrum', label: 'Compute spectrum' },
      { value: 'pool', label: 'Function pool' },
    ],
    initial: 'pool',
  });
  return scene === 'spectrum' ? <SpectrumScene picker={picker} /> : <PoolScene picker={picker} />;
}

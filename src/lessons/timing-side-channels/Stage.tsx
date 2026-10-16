import { useScenePicker } from '../../components/ScenePicker';
import { CompareScene } from './CompareScene';
import { MitigationScene } from './MitigationScene';
import { NoiseScene } from './NoiseScene';
import { TracesScene } from './TracesScene';
import './styles.css';

type Scene = 'compare' | 'noise' | 'traces' | 'mitigations';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'compare', label: 'Counting comparisons' },
  { value: 'noise', label: 'The signal in the noise' },
  { value: 'traces', label: 'Do the traces differ?' },
  { value: 'mitigations', label: 'Mitigations and what to use' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'compare' });
  if (scene === 'noise') return <NoiseScene key={scene} picker={picker} />;
  if (scene === 'traces') return <TracesScene key={scene} picker={picker} />;
  if (scene === 'mitigations') return <MitigationScene key={scene} picker={picker} />;
  return <CompareScene key={scene} picker={picker} />;
}

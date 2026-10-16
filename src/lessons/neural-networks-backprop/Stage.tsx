import { useScenePicker } from '../../components/ScenePicker';
import { BackwardScene } from './BackwardScene';
import { ForwardScene } from './ForwardScene';
import { NeuronScene } from './NeuronScene';
import { TrainScene } from './TrainScene';
import './styles.css';

type Scene = 'neuron' | 'forward' | 'backward' | 'train';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'neuron', label: 'One neuron' },
  { value: 'forward', label: 'Forward pass' },
  { value: 'backward', label: 'Backward pass' },
  { value: 'train', label: 'Train it' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'neuron' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'forward') return <ForwardScene key={scene} picker={picker} />;
  if (scene === 'backward') return <BackwardScene key={scene} picker={picker} />;
  if (scene === 'train') return <TrainScene key={scene} picker={picker} />;
  return <NeuronScene key={scene} picker={picker} />;
}

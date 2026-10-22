import { useScenePicker } from '../../components/ScenePicker';
import { BlockScene } from './BlockScene';
import { ImageScene } from './ImageScene';
import { LossScene } from './LossScene';
import { QuantScene } from './QuantScene';
import './styles.css';

type Scene = 'block' | 'quant' | 'image' | 'loss';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'block', label: 'A block' },
  { value: 'quant', label: 'Quantise' },
  { value: 'image', label: 'Whole image' },
  { value: 'loss', label: 'Generation loss' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'block' });
  if (scene === 'quant') return <QuantScene key={scene} picker={picker} />;
  if (scene === 'image') return <ImageScene key={scene} picker={picker} />;
  if (scene === 'loss') return <LossScene key={scene} picker={picker} />;
  return <BlockScene key={scene} picker={picker} />;
}

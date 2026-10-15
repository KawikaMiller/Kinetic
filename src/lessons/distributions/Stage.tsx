import { useScenePicker } from '../../components/ScenePicker';
import { MeanScene } from './MeanScene';
import { MysteryScene } from './MysteryScene';
import { PoissonScene } from './PoissonScene';
import { ShapeScene } from './ShapeScene';
import './styles.css';

type Scene = 'shape' | 'poisson' | 'mean' | 'mystery';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'shape', label: 'Pick a shape' },
  { value: 'poisson', label: 'Counts and gaps' },
  { value: 'mean', label: 'What the mean hides' },
  { value: 'mystery', label: 'Which one is mine?' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'shape' });
  if (scene === 'poisson') return <PoissonScene picker={picker} />;
  if (scene === 'mean') return <MeanScene picker={picker} />;
  if (scene === 'mystery') return <MysteryScene picker={picker} />;
  return <ShapeScene picker={picker} />;
}

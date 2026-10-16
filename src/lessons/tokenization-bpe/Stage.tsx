import { useScenePicker } from '../../components/ScenePicker';
import { BytesScene } from './BytesScene';
import { MergeScene } from './MergeScene';
import { TokenCostScene } from './TokenCostScene';
import { VocabScene } from './VocabScene';
import './styles.css';

type Scene = 'merge' | 'vocab' | 'bytes' | 'cost';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'merge', label: 'Build a vocabulary' },
  { value: 'vocab', label: 'Vocabulary size' },
  { value: 'bytes', label: 'Bytes' },
  { value: 'cost', label: 'Cost and counting' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'merge' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'vocab') return <VocabScene key={scene} picker={picker} />;
  if (scene === 'bytes') return <BytesScene key={scene} picker={picker} />;
  if (scene === 'cost') return <TokenCostScene key={scene} picker={picker} />;
  return <MergeScene key={scene} picker={picker} />;
}

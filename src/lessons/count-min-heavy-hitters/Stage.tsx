import { useScenePicker } from '../../components/ScenePicker';
import { BreakScene } from './BreakScene';
import { GridScene } from './GridScene';
import { HeavyScene } from './HeavyScene';
import { MergeScene } from './MergeScene';
import { SizeScene } from './SizeScene';
import './styles.css';

type Scene = 'grid' | 'size' | 'heavy' | 'merge' | 'break';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'grid', label: 'The grid' },
  { value: 'size', label: 'Size against error' },
  { value: 'heavy', label: 'Heavy hitters' },
  { value: 'merge', label: 'Merge partitions' },
  { value: 'break', label: 'Breaking it' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'grid' });
  if (scene === 'size') return <SizeScene picker={picker} />;
  if (scene === 'heavy') return <HeavyScene picker={picker} />;
  if (scene === 'merge') return <MergeScene picker={picker} />;
  if (scene === 'break') return <BreakScene picker={picker} />;
  return <GridScene picker={picker} />;
}

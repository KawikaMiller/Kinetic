import { useScenePicker } from '../../components/ScenePicker';
import { CardinalityScene } from './CardinalityScene';
import { EncoderScene } from './EncoderScene';
import { RawScene } from './RawScene';
import { RetentionScene } from './RetentionScene';
import { RollupScene } from './RollupScene';
import './styles.css';

type Scene = 'raw' | 'rollup' | 'encoder' | 'retention' | 'cardinality';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'raw', label: 'The raw series' },
  { value: 'rollup', label: 'Downsample and what it hides' },
  { value: 'encoder', label: 'Compression' },
  { value: 'retention', label: 'Retention tiers' },
  { value: 'cardinality', label: 'High cardinality' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'raw' });
  if (scene === 'rollup') return <RollupScene key="rollup" picker={picker} />;
  if (scene === 'encoder') return <EncoderScene key="encoder" picker={picker} />;
  if (scene === 'retention') return <RetentionScene key="retention" picker={picker} />;
  if (scene === 'cardinality') return <CardinalityScene key="cardinality" picker={picker} />;
  return <RawScene key="raw" picker={picker} />;
}

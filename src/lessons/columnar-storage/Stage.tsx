import { useScenePicker } from '../../components/ScenePicker';
import { EncodingScene } from './EncodingScene';
import { LayoutScene } from './LayoutScene';
import { RowsScene } from './RowsScene';
import { SkipScene } from './SkipScene';
import { VectorScene } from './VectorScene';
import './styles.css';

type Scene = 'layouts' | 'rows' | 'encodings' | 'skip' | 'vector';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'layouts', label: 'Same table, two layouts' },
  { value: 'rows', label: 'Where rows win' },
  { value: 'encodings', label: 'Encodings' },
  { value: 'skip', label: 'Skip what you can' },
  { value: 'vector', label: 'Vectorised scans' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'layouts' });
  if (scene === 'rows') return <RowsScene key="rows" picker={picker} />;
  if (scene === 'encodings') return <EncodingScene key="encodings" picker={picker} />;
  if (scene === 'skip') return <SkipScene key="skip" picker={picker} />;
  if (scene === 'vector') return <VectorScene key="vector" picker={picker} />;
  return <LayoutScene key="layouts" picker={picker} />;
}

import { useScenePicker } from '../../components/ScenePicker';
import { CurseScene } from './CurseScene';
import { ExactScene } from './ExactScene';
import { HnswScene } from './HnswScene';
import { IvfScene } from './IvfScene';
import { TableScene } from './TableScene';
import { useSettings } from './useSettings';
import './styles.css';

type Scene = 'exact' | 'ivf' | 'hnsw' | 'curse' | 'table';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'exact', label: 'Exact costs N' },
  { value: 'ivf', label: 'IVF' },
  { value: 'hnsw', label: 'HNSW' },
  { value: 'curse', label: 'Why 2-D lies' },
  { value: 'table', label: 'The trade' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'exact' });
  const [s, set] = useSettings();
  if (scene === 'ivf') return <IvfScene picker={picker} s={s} set={set} />;
  if (scene === 'hnsw') return <HnswScene picker={picker} s={s} set={set} />;
  if (scene === 'curse') return <CurseScene picker={picker} s={s} />;
  if (scene === 'table') return <TableScene picker={picker} s={s} />;
  return <ExactScene picker={picker} s={s} set={set} />;
}

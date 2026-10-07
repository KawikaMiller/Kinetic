import { useScenePicker } from '../../components/ScenePicker';
import { DiffScene } from './DiffScene';
import { TableScene } from './TableScene';
import './styles.css';

const SCENES = [
  { value: 'table' as const, label: 'Words' },
  { value: 'diff' as const, label: 'Line diff' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'table' });
  return scene === 'diff' ? <DiffScene picker={picker} /> : <TableScene picker={picker} />;
}

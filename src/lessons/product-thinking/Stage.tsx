import { useScenePicker } from '../../components/ScenePicker';
import { FolkloreScene } from './FolkloreScene';
import { OPENING, type SceneId } from './opening';
import { PowerScene } from './PowerScene';
import { SeriesScene } from './SeriesScene';
import { TreeScene } from './TreeScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'tree', label: 'The outcomes tree' },
  { value: 'series', label: 'Which number to watch' },
  { value: 'power', label: 'Can we measure it?' },
  { value: 'folklore', label: 'Folklore check' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'series') return <SeriesScene key="series" picker={picker} />;
  if (scene === 'power') return <PowerScene key="power" picker={picker} />;
  if (scene === 'folklore') return <FolkloreScene key="folklore" picker={picker} />;
  return <TreeScene key="tree" picker={picker} />;
}

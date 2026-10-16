import { useScenePicker } from '../../components/ScenePicker';
import { MergeScene } from './MergeScene';
import { RoomsScene } from './RoomsScene';
import { SegScene } from './SegScene';
import { SelectScene } from './SelectScene';
import './styles.css';

type Scene = 'merge' | 'rooms' | 'segments' | 'select';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'merge', label: 'Merge intervals' },
  { value: 'rooms', label: 'How many rooms?' },
  { value: 'segments', label: 'Crossing segments' },
  { value: 'select', label: 'Choose the sweep key' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'merge' });
  if (scene === 'rooms') return <RoomsScene key="rooms" picker={picker} />;
  if (scene === 'segments') return <SegScene key="segments" picker={picker} />;
  if (scene === 'select') return <SelectScene key="select" picker={picker} />;
  return <MergeScene key="merge" picker={picker} />;
}

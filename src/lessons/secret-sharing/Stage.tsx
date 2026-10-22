import { useScenePicker } from '../../components/ScenePicker';
import { ByteScene } from './ByteScene';
import { FailScene } from './FailScene';
import { PolyScene } from './PolyScene';
import './styles.css';

type Scene = 'poly' | 'byte' | 'fail';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'poly', label: 'A polynomial hides the secret' },
  { value: 'byte', label: 'Share a byte' },
  { value: 'fail', label: 'Where it goes wrong' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'poly' });
  if (scene === 'byte') return <ByteScene key="byte" picker={picker} />;
  if (scene === 'fail') return <FailScene key="fail" picker={picker} />;
  return <PolyScene key="poly" picker={picker} />;
}

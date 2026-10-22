import { useScenePicker } from '../../components/ScenePicker';
import { AcneScene } from './AcneScene';
import { BvhScene } from './BvhScene';
import { PixelScene } from './PixelScene';
import { ShadingScene } from './ShadingScene';
import './styles.css';

type Scene = 'pixel' | 'shading' | 'acne' | 'bvh';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'pixel', label: 'One pixel' },
  { value: 'shading', label: 'Shading and mirrors' },
  { value: 'acne', label: 'Shadow acne' },
  { value: 'bvh', label: 'Acceleration' },
];

export function Stage() {
  const [scene, picker, setScene] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pixel' });
  const showSixtyFour = () => setScene('bvh');
  if (scene === 'shading') return <ShadingScene key={scene} picker={picker} onSixtyFour={showSixtyFour} />;
  if (scene === 'acne') return <AcneScene key={scene} picker={picker} />;
  if (scene === 'bvh') return <BvhScene key={scene} picker={picker} />;
  return <PixelScene key={scene} picker={picker} />;
}

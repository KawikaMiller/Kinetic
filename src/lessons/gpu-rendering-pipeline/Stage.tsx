import { useScenePicker } from '../../components/ScenePicker';
import { BlendScene } from './BlendScene';
import { OrderScene } from './OrderScene';
import { PipelineScene } from './PipelineScene';
import { ShaderScene } from './ShaderScene';
import { SlantScene } from './SlantScene';
import './styles.css';

type Scene = 'stages' | 'shader' | 'slant' | 'order' | 'blend';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'stages', label: 'The stages' },
  { value: 'shader', label: 'A fragment shader' },
  { value: 'slant', label: 'Perspective-correct' },
  { value: 'order', label: 'Order and early depth' },
  { value: 'blend', label: 'Blending' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'stages' });
  if (scene === 'shader') return <ShaderScene key={scene} picker={picker} />;
  if (scene === 'slant') return <SlantScene key={scene} picker={picker} />;
  if (scene === 'order') return <OrderScene key={scene} picker={picker} />;
  if (scene === 'blend') return <BlendScene key={scene} picker={picker} />;
  return <PipelineScene key={scene} picker={picker} />;
}

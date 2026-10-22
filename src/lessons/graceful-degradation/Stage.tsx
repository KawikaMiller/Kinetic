import { useScenePicker } from '../../components/ScenePicker';
import { BrownoutScene } from './BrownoutScene';
import { StaleScene } from './StaleScene';
import { WidgetScene } from './WidgetScene';
import './styles.css';

type Scene = 'widgets' | 'brownout' | 'stale';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'widgets', label: 'A page of widgets' },
  { value: 'brownout', label: 'Brownout' },
  { value: 'stale', label: 'Stale on error' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'widgets' });
  if (scene === 'brownout') return <BrownoutScene key={scene} picker={picker} />;
  if (scene === 'stale') return <StaleScene key={scene} picker={picker} />;
  return <WidgetScene key={scene} picker={picker} />;
}

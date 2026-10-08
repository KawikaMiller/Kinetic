import { useScenePicker } from '../../components/ScenePicker';
import { AnimateScene } from './AnimateScene';
import { ChangeScene } from './ChangeScene';
import { RenderTreeScene } from './RenderTreeScene';
import { ThrashScene } from './ThrashScene';
import './styles.css';

const SCENES = [
  { value: 'change', label: 'A change' },
  { value: 'thrash', label: 'Layout thrashing' },
  { value: 'animate', label: 'Animation' },
  { value: 'tree', label: 'Render tree' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'change' });
  switch (scene) {
    case 'thrash':
      return <ThrashScene picker={picker} />;
    case 'animate':
      return <AnimateScene picker={picker} />;
    case 'tree':
      return <RenderTreeScene picker={picker} />;
    default:
      return <ChangeScene picker={picker} />;
  }
}

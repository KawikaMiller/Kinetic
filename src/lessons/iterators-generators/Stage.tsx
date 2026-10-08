import { useScenePicker } from '../../components/ScenePicker';
import { PassScene } from './PassScene';
import { PipeScene } from './PipeScene';
import { ProtoScene } from './ProtoScene';
import './styles.css';

const SCENES = [
  { value: 'pipe', label: 'Eager vs lazy' },
  { value: 'proto', label: 'The protocol' },
  { value: 'pass', label: 'Single pass' },
] as const;

type Scene = (typeof SCENES)[number]['value'];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: [...SCENES], initial: 'pipe' });
  if (scene === 'proto') return <ProtoScene picker={picker} />;
  if (scene === 'pass') return <PassScene picker={picker} />;
  return <PipeScene picker={picker} />;
}

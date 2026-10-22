import { useScenePicker } from '../../components/ScenePicker';
import { KernelScene } from './KernelScene';
import { OPENING_SCENE, type SceneId } from './opening';
import { RingsScene } from './RingsScene';
import { SeccompScene } from './SeccompScene';
import { ViewsScene } from './ViewsScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'rings', label: 'Concentric boundaries' },
  { value: 'seccomp', label: 'A seccomp allow-list' },
  { value: 'views', label: 'Namespaces and cgroups' },
  { value: 'kernel', label: 'What is shared' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING_SCENE });
  if (scene === 'seccomp') return <SeccompScene key="seccomp" picker={picker} />;
  if (scene === 'views') return <ViewsScene key="views" picker={picker} />;
  if (scene === 'kernel') return <KernelScene key="kernel" picker={picker} />;
  return <RingsScene key="rings" picker={picker} />;
}

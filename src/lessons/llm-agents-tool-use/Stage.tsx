import { useScenePicker } from '../../components/ScenePicker';
import { ContextScene } from './ContextScene';
import { GuardScene } from './GuardScene';
import { LoopScene } from './LoopScene';
import { type SceneId } from './settings';
import { TrustScene } from './TrustScene';
import './styles.css';

const SCENE_OPTIONS: { value: SceneId; label: string }[] = [
  { value: 'loop', label: 'The loop' },
  { value: 'context', label: 'The context fills' },
  { value: 'guard', label: 'Guardrails' },
  { value: 'trust', label: 'Untrusted data' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENE_OPTIONS, initial: 'loop' });
  if (scene === 'context') return <ContextScene key={scene} picker={picker} />;
  if (scene === 'guard') return <GuardScene key={scene} picker={picker} />;
  if (scene === 'trust') return <TrustScene key={scene} picker={picker} />;
  return <LoopScene key={scene} picker={picker} />;
}

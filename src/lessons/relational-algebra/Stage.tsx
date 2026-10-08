import { useScenePicker } from '../../components/ScenePicker';
import { BuildScene } from './BuildScene';
import { NullScene } from './NullScene';
import { PushdownScene } from './PushdownScene';
import './styles.css';

type SceneId = 'build' | 'pushdown' | 'nulls';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'build', label: 'Build & run' },
  { value: 'pushdown', label: 'Push σ down' },
  { value: 'nulls', label: "SQL's NULL" },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'build' });
  if (scene === 'pushdown') return <PushdownScene picker={picker} />;
  if (scene === 'nulls') return <NullScene picker={picker} />;
  return <BuildScene picker={picker} />;
}

import { useScenePicker } from '../../components/ScenePicker';
import { LockfileScene } from './LockfileScene';
import { RangeTester } from './RangeTester';
import { TreeScene } from './TreeScene';
import './styles.css';

const SCENES = [
  { value: 'range' as const, label: 'Semver ranges' },
  { value: 'lock' as const, label: 'Lockfiles' },
  { value: 'tree' as const, label: 'Transitive deps' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'range' });
  if (scene === 'lock') return <LockfileScene picker={picker} />;
  if (scene === 'tree') return <TreeScene picker={picker} />;
  return <RangeTester picker={picker} />;
}

import { useScenePicker } from '../../components/ScenePicker';
import { RaceScene } from './RaceScene';
import { SnapshotScene } from './SnapshotScene';
import { TwoShardScene } from './TwoShardScene';
import './styles.css';

type Scene = 'snapshot' | 'race' | 'twoShard';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'snapshot', label: 'Snapshot reads at a timestamp' },
  { value: 'race', label: 'The race' },
  { value: 'twoShard', label: 'Two shards, two-phase commit' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'race' });
  if (scene === 'snapshot') return <SnapshotScene key="snapshot" picker={picker} />;
  if (scene === 'twoShard') return <TwoShardScene key="twoShard" picker={picker} />;
  return <RaceScene key="race" picker={picker} />;
}

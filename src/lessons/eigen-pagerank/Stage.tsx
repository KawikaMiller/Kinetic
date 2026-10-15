import { useScenePicker } from '../../components/ScenePicker';
import { ArrowScene } from './ArrowScene';
import { RankScene } from './RankScene';
import './styles.css';

type Scene = 'apply' | 'nothing' | 'surfer' | 'leaks';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'apply', label: 'Apply it again and again' },
  { value: 'nothing', label: 'When nothing lines up' },
  { value: 'surfer', label: 'PageRank as a random surfer' },
  { value: 'leaks', label: 'Where it leaks' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'apply' });
  if (scene === 'nothing') return <ArrowScene picker={picker} mode="nothing" />;
  if (scene === 'surfer') return <RankScene picker={picker} presetIds={['web6', 'example']} initial="web6" />;
  if (scene === 'leaks') return <RankScene picker={picker} presetIds={['chain', 'trap', 'deadend']} initial="chain" />;
  return <ArrowScene picker={picker} mode="apply" />;
}

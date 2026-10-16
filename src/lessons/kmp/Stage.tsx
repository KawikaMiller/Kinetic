import { useScenePicker } from '../../components/ScenePicker';
import { CountScene } from './CountScene';
import { LpsScene } from './LpsScene';
import { MatchScene } from './MatchScene';
import { NaiveScene } from './NaiveScene';
import './styles.css';

type Scene = 'naive' | 'lps' | 'match' | 'count';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'naive', label: 'The naive slide' },
  { value: 'lps', label: 'The failure table' },
  { value: 'match', label: 'The match' },
  { value: 'count', label: 'Count the work' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'naive' });
  if (scene === 'lps') return <LpsScene key="lps" picker={picker} />;
  if (scene === 'match') return <MatchScene key="match" picker={picker} />;
  if (scene === 'count') return <CountScene key="count" picker={picker} />;
  return <NaiveScene key="naive" picker={picker} />;
}

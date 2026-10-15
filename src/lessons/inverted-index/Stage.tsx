import { useScenePicker } from '../../components/ScenePicker';
import { BuildScene } from './BuildScene';
import { CompressScene } from './CompressScene';
import { QueryScene } from './QueryScene';
import { RankScene } from './RankScene';
import { useCorpus } from './useCorpus';
import './styles.css';

type Scene = 'build' | 'query' | 'rank' | 'compress';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'build', label: 'Build the index' },
  { value: 'query', label: 'Query' },
  { value: 'rank', label: 'Ranking' },
  { value: 'compress', label: 'Compression and updates' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'build' });
  const corpus = useCorpus();
  if (scene === 'query') return <QueryScene picker={picker} corpus={corpus} />;
  if (scene === 'rank') return <RankScene picker={picker} corpus={corpus} />;
  if (scene === 'compress') return <CompressScene picker={picker} corpus={corpus} />;
  return <BuildScene picker={picker} corpus={corpus} />;
}

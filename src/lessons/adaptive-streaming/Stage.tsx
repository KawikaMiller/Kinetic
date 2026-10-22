import { useScenePicker } from '../../components/ScenePicker';
import { CdnScene } from './CdnScene';
import { CompareScene } from './CompareScene';
import { LadderScene } from './LadderScene';
import { PlayerScene } from './PlayerScene';
import './styles.css';

type Scene = 'player' | 'compare' | 'cdn' | 'ladder';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'player', label: 'The player' },
  { value: 'compare', label: 'Three algorithms' },
  { value: 'cdn', label: 'Why it scales' },
  { value: 'ladder', label: 'The ladder' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'player' });
  if (scene === 'compare') return <CompareScene key={scene} picker={picker} />;
  if (scene === 'cdn') return <CdnScene key={scene} picker={picker} />;
  if (scene === 'ladder') return <LadderScene key={scene} picker={picker} />;
  return <PlayerScene key={scene} picker={picker} />;
}

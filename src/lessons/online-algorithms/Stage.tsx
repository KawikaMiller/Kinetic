import { useScenePicker } from '../../components/ScenePicker';
import { AdversaryScene } from './AdversaryScene';
import { PagingScene } from './PagingScene';
import { SkiScene } from './SkiScene';
import './styles.css';

type Scene = 'ski' | 'adversary' | 'paging';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'ski', label: 'Ski rental' },
  { value: 'adversary', label: 'Be the adversary' },
  { value: 'paging', label: 'Paging' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'ski' });
  if (scene === 'adversary') return <AdversaryScene key="adversary" picker={picker} />;
  if (scene === 'paging') return <PagingScene key="paging" picker={picker} />;
  return <SkiScene key="ski" picker={picker} />;
}

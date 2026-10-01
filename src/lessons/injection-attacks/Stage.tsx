import { useScenePicker } from '../../components/ScenePicker';
import { ContextsScene } from './ContextsScene';
import { HtmlScene } from './HtmlScene';
import { SqlScene } from './SqlScene';
import './styles.css';

type Scene = 'sql' | 'html' | 'everywhere';

const SCENES: { value: Scene; label: string }[] = [
  { value: 'sql', label: '① A database query' },
  { value: 'html', label: '② A web page' },
  { value: 'everywhere', label: '③ Everywhere else' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'sql' });
  // Each scene owns its own StageFrame, so switching remounts cleanly.
  if (scene === 'html') return <HtmlScene picker={picker} />;
  if (scene === 'everywhere') return <ContextsScene picker={picker} />;
  return <SqlScene picker={picker} />;
}

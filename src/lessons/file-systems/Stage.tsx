import { useScenePicker } from '../../components/ScenePicker';
import { CrashScene } from './CrashScene';
import { LinksScene } from './LinksScene';
import { SyncScene } from './SyncScene';
import { WalkScene } from './WalkScene';
import './styles.css';

type Scene = 'walk' | 'links' | 'crash' | 'fsync';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'walk', label: 'Path walk' },
      { value: 'links', label: 'Links' },
      { value: 'crash', label: 'Crash' },
      { value: 'fsync', label: 'fsync' },
    ],
    initial: 'walk',
  });
  if (scene === 'links') return <LinksScene picker={picker} />;
  if (scene === 'crash') return <CrashScene picker={picker} />;
  if (scene === 'fsync') return <SyncScene picker={picker} />;
  return <WalkScene picker={picker} />;
}

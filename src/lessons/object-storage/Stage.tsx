import { useScenePicker } from '../../components/ScenePicker';
import { AccessScene } from './AccessScene';
import { ListingScene } from './ListingScene';
import { MultipartScene } from './MultipartScene';
import { StoresScene } from './StoresScene';
import './styles.css';

type Scene = 'stores' | 'multipart' | 'listing' | 'access';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'stores', label: 'Three stores' },
      { value: 'multipart', label: 'Multipart upload' },
      { value: 'listing', label: 'Keys & listing' },
      { value: 'access', label: 'Access & cost' },
    ],
    initial: 'stores',
  });
  if (scene === 'multipart') return <MultipartScene picker={picker} />;
  if (scene === 'listing') return <ListingScene picker={picker} />;
  if (scene === 'access') return <AccessScene picker={picker} />;
  return <StoresScene picker={picker} />;
}

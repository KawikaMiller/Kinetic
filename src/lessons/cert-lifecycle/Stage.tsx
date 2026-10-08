import { useScenePicker } from '../../components/ScenePicker';
import { AcmeScene } from './AcmeScene';
import { GotchaScene } from './GotchaScene';
import { LifetimeScene } from './LifetimeScene';
import { ManualScene } from './ManualScene';
import './styles.css';

type Scene = 'manual' | 'acme' | 'gotchas' | 'lifetimes';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'manual', label: 'Manual' },
      { value: 'acme', label: 'Automated' },
      { value: 'gotchas', label: 'Gotchas' },
      { value: 'lifetimes', label: 'Shorter lifetimes' },
    ],
    initial: 'manual',
  });
  if (scene === 'acme') return <AcmeScene picker={picker} />;
  if (scene === 'gotchas') return <GotchaScene picker={picker} />;
  if (scene === 'lifetimes') return <LifetimeScene picker={picker} />;
  return <ManualScene picker={picker} />;
}

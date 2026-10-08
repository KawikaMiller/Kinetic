import { useScenePicker } from '../../components/ScenePicker';
import { AdapterScene } from './AdapterScene';
import { BuilderScene } from './BuilderScene';
import { DecoratorScene } from './DecoratorScene';
import { FactoryScene } from './FactoryScene';
import type { PatternId } from './model';
import './styles.css';

const PATTERNS: { value: PatternId; label: string }[] = [
  { value: 'factory', label: 'Factory' },
  { value: 'builder', label: 'Builder' },
  { value: 'adapter', label: 'Adapter' },
  { value: 'decorator', label: 'Decorator' },
];

export function Stage() {
  const [pattern, picker] = useScenePicker<PatternId>({ label: 'Pattern', options: PATTERNS, initial: 'factory' });
  if (pattern === 'builder') return <BuilderScene picker={picker} />;
  if (pattern === 'adapter') return <AdapterScene picker={picker} />;
  if (pattern === 'decorator') return <DecoratorScene picker={picker} />;
  return <FactoryScene picker={picker} />;
}

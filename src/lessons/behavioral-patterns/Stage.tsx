import { useScenePicker } from '../../components/ScenePicker';
import { CommandScene } from './CommandScene';
import { ObserverScene } from './ObserverScene';
import { StateScene } from './StateScene';
import { StrategyScene } from './StrategyScene';
import './styles.css';

const PATTERNS = [
  { value: 'strategy', label: 'Strategy' },
  { value: 'observer', label: 'Observer' },
  { value: 'command', label: 'Command' },
  { value: 'state', label: 'State' },
] as const;

type Pattern = (typeof PATTERNS)[number]['value'];

export function Stage() {
  const [pattern, picker] = useScenePicker<Pattern>({ label: 'Pattern', options: [...PATTERNS], initial: 'strategy' });
  if (pattern === 'observer') return <ObserverScene picker={picker} />;
  if (pattern === 'command') return <CommandScene picker={picker} />;
  if (pattern === 'state') return <StateScene picker={picker} />;
  return <StrategyScene picker={picker} />;
}

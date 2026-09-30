import { useState, type ReactNode } from 'react';
import type { Option } from './options';
import { Segmented } from './ui';

/**
 * For lessons split into sub-scenes ("Lane", "Demo"), each with its own StageFrame
 * and player. Returns the current scene, the picker to put first in every
 * sub-scene's controls, and a setter for when one scene hands off to another
 * (a "halve this back" button that jumps to the halving scene):
 *
 *   const [scene, picker, setScene] = useScenePicker({ label: 'Demo', options: DEMOS, initial: 'stacks' });
 *   return scene === 'stacks' ? <Stacks picker={picker} /> : <Layers picker={picker} />;
 */
export function useScenePicker<T extends string>(o: {
  label: string;
  options: Option<T>[];
  initial: T;
}): [T, ReactNode, (scene: T) => void] {
  const [scene, setScene] = useState<T>(o.initial);
  const picker = <Segmented label={o.label} options={o.options} value={scene} onChange={setScene} />;
  return [scene, picker, setScene];
}

import { useState, type ReactNode } from 'react';
import { Segmented, type Option } from './ui';

/**
 * For lessons split into sub-scenes ("Lane", "Demo"), each with its own StageFrame
 * and player. Returns the current scene and the picker to put first in every
 * sub-scene's controls:
 *
 *   const [scene, picker] = useScenePicker({ label: 'Demo', options: DEMOS, initial: 'stacks' });
 *   return scene === 'stacks' ? <Stacks picker={picker} /> : <Layers picker={picker} />;
 */
export function useScenePicker<T extends string>(o: { label: string; options: Option<T>[]; initial: T }): [T, ReactNode] {
  const [scene, setScene] = useState<T>(o.initial);
  const picker = <Segmented label={o.label} options={o.options} value={scene} onChange={setScene} />;
  return [scene, picker];
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Option } from './options';
import { Segmented } from './ui';

/** True when keyboard focus sits on a real element, not dropped to <body>. */
const hasFocus = () => document.activeElement !== null && document.activeElement !== document.body;

/**
 * For lessons split into sub-scenes ("Lane", "Demo"), each with its own StageFrame
 * and player. Returns the current scene, the picker to put first in every
 * sub-scene's controls, and a setter for when one scene hands off to another
 * (a "halve this back" button that jumps to the halving scene):
 *
 *   const [scene, picker, setScene] = useScenePicker({ label: 'Demo', options: DEMOS, initial: 'stacks' });
 *   return scene === 'stacks' ? <Stacks picker={picker} /> : <Layers picker={picker} />;
 *
 * Each scene usually renders its own copy of the picker, so a switch unmounts the
 * focused button. When a switch made while something had focus leaves focus on
 * <body>, the hook puts it on the new picker's chosen option, so arrow keys keep working.
 */
export function useScenePicker<T extends string>(o: {
  label: string;
  options: Option<T>[];
  initial: T;
}): [T, ReactNode, (scene: T) => void] {
  const [scene, setSceneState] = useState<T>(o.initial);
  const group = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  const setScene = (next: T) => {
    restoreFocus.current = hasFocus();
    setSceneState(next);
  };

  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    if (!hasFocus()) group.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [scene]);

  const picker = <Segmented ref={group} label={o.label} options={o.options} value={scene} onChange={setScene} />;
  return [scene, picker, setScene];
}
